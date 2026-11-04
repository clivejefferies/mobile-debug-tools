import { classifyTraceFailure } from './process.js'
import type { TraceClock } from '../system-trace.js'
import { TraceError } from '../system-trace-error.js'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { evidenceSessionId } from '../evidence.js'
import { IosTraceNative, type IosRecording } from './native.js'
import type { IosApp, IosTarget } from './capabilities.js'
import type { validateArtifact } from './artifact.js'

export interface IosTraceResult {
  trace_id: string; session_id: string; device: IosTarget; backend: 'xctrace'
  state: 'starting' | 'recording' | 'stopping' | 'completed' | 'cancelled' | 'failed'
  reason: string | null; recovery: string | null; completion_reason: 'requested' | 'duration_limit' | 'cancelled' | 'error' | null
  capture_started_at_ms: number | null; capture_completed_at_ms: number | null; recording_ready_at_ms: number | null
  app_id: string; pid: number | null; executable: string | null; template: 'Time Profiler'
  artifact: Awaited<ReturnType<typeof validateArtifact>> | null
  cleanup: { status: 'pending' | 'complete' | 'failed'; remaining_resources: string[] }
  warnings: string[]; correlation_ids: string[]; clock_alignment: 'unknown'
}
interface Session {
  result: IosTraceResult; directory?: string; app?: IosApp; recording?: IosRecording
  timer?: ReturnType<typeof setTimeout>; deadline: number; terminal?: number; discard: boolean
  queue: Promise<unknown>; linked: Set<string>; partial: Set<string>; recorderOk?: boolean
}
const reasonFor = (error: unknown, fallback: string) => {
  const code = error instanceof Error ? error.message : ''
  return ['STORAGE_LIMIT', 'APP_IDENTITY_CHANGED', 'ACTION_TIMEOUT', 'READINESS_TIMEOUT', 'RECORDER_EXITED', 'PROFILING_PERMISSION_REQUIRED', 'APP_NOT_RUNNING', 'TARGET_DISCONNECTED'].includes(code) ? code : fallback
}
export class IosTraceSessions {
  private sessions = new Map<string, Session>()
  private closing = false
  constructor(private native = new IosTraceNative(), private time: TraceClock = {
    wall: Date.now, mono: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    schedule: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer }, clear: clearTimeout
  }) {}
  private get(id: string) {
    this.prune(); const s = this.sessions.get(id)
    if (!s) throw new TraceError('TRACE_NOT_FOUND')
    return s
  }
  private prune() {
    const terminal = [...this.sessions.values()].filter(s => s.terminal !== undefined && s.result.cleanup.status === 'complete')
    for (const [index, s] of terminal.entries()) if (this.time.mono() - s.terminal! >= 600000 || index < terminal.length - 100) this.sessions.delete(s.result.trace_id)
  }
  private serial<T>(s: Session, fn: () => Promise<T>) {
    const promise = s.queue.then(fn); s.queue = promise.catch(() => {}); return promise
  }
  private snapshot(s: Session) { return structuredClone(s.result) }
  private fail(s: Session, reason: string) {
    s.result.state = 'failed'; s.result.reason = reason; s.result.completion_reason = 'error'
    s.result.recovery = reason === 'PROFILING_PERMISSION_REQUIRED' ? 'Grant the required profiling permission through the macOS or Xcode UI, then explicitly start a new capture.' : reason === 'TRACE_ARTIFACT_FAILED' ? 'Retry stop to validate the finalised owned artifact, or cancel to discard.' : 'Check target, app and profiling permissions; cancel the owned session before retrying start.'
    for (const id of s.linked) s.partial.add(id)
  }
  async start(device: IosTarget, appId: string, duration = 30000) {
    this.prune()
    const active = [...this.sessions.values()].filter(s => s.result.cleanup.status !== 'complete')
    if (this.closing || active.length >= 4 || active.some(s => s.result.device.id === device.id)) throw new TraceError('TRACE_BUSY')
    if (!Number.isInteger(duration) || duration < 1000 || duration > 120000) throw new TraceError('INVALID_ARGUMENT')
    const result: IosTraceResult = {
      trace_id: randomUUID(), session_id: evidenceSessionId(), device: structuredClone(device), backend: 'xctrace', state: 'starting',
      reason: null, recovery: null, completion_reason: null, capture_started_at_ms: null, capture_completed_at_ms: null,
      recording_ready_at_ms: null, app_id: appId, pid: null, executable: null, template: 'Time Profiler', artifact: null,
      cleanup: { status: 'pending', remaining_resources: [] }, warnings: [], correlation_ids: [], clock_alignment: 'unknown'
    }
    const s: Session = { result, deadline: Infinity, discard: false, queue: Promise.resolve(), linked: new Set(), partial: new Set() }
    this.sessions.set(result.trace_id, s)
    return this.serial(s, async () => {
      try {
        s.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-debug-ios-trace-'))
        await fs.chmod(s.directory, 0o700)
        s.result.cleanup.remaining_resources = [s.directory]
        s.app = await this.native.resolve(device.id, appId)
        s.result.pid = s.app.pid; s.result.executable = s.app.executable
        if (this.closing) throw new TraceError('TRACE_BUSY')
        s.result.capture_started_at_ms = this.time.wall()
        s.deadline = Infinity
        s.recording = await this.native.start(device.id, s.app, s.directory, duration, recording => { s.recording = recording; if (this.closing) recording.recorder.signal('SIGINT') })
        if (this.closing) throw new Error('READINESS_TIMEOUT')
        s.deadline = this.time.mono() + duration
        s.result.recording_ready_at_ms = s.recording.ready_at_ms
        s.result.state = 'recording'
        this.schedule(s)
        void s.recording.recorder.done.then(() => this.control(result.trace_id, 'status')).catch(() => {})
      } catch (error) {
        this.fail(s, reasonFor(error, 'TRACE_START_FAILED')); s.discard = true
        await this.finalise(s, 'cancel', true)
      }
      return this.snapshot(s)
    })
  }
  private schedule(s: Session) {
    if (s.result.state !== 'recording') return
    s.timer = this.time.schedule(() => {
      void this.serial(s, () => this.poll(s)).finally(() => this.schedule(s)).catch(() => {})
    }, 1000)
  }
  private async poll(s: Session) {
    if (s.result.state !== 'recording' || !s.recording || !s.app) return
    try { await this.native.monitor(s.result.device.id, s.app, s.recording) }
    catch (error) { this.fail(s, reasonFor(error, 'TARGET_DISCONNECTED')); s.discard = true; await this.finalise(s, 'cancel', true); return }
    if (this.time.mono() >= s.deadline || !s.recording.recorder.alive()) await this.finalise(s, 'duration')
  }
  async control(id: string, op: 'status' | 'stop' | 'cancel' | 'duration', timeout?: number) {
    const s = this.get(id)
    return this.serial(s, async () => {
      if (s.result.cleanup.status === 'complete') return this.snapshot(s)
      if (op === 'status' && s.result.state === 'recording' && s.recording?.recorder.alive() && this.time.mono() < s.deadline) {
        await this.poll(s); return this.snapshot(s)
      }
      await this.finalise(s, op === 'status' ? 'duration' : op, false, timeout)
      return this.snapshot(s)
    })
  }
  private async finalise(s: Session, op: string, preserveFailure = false, timeout?: number) {
    if (s.timer) { this.time.clear(s.timer); s.timer = undefined }
    if (op === 'cancel') s.discard = true
    if (!preserveFailure) s.result.state = 'stopping'
    for (const id of s.linked) s.partial.add(id)
    try {
      await this.finishRecorder(s, op, timeout)
      s.result.capture_completed_at_ms ??= this.time.wall()
      await this.finishArtifact(s)
      s.result.cleanup = { status: 'complete', remaining_resources: [] }; s.terminal = this.time.mono()
      if (!preserveFailure) {
        s.result.state = s.discard ? 'cancelled' : 'completed'; s.result.reason = s.discard ? 'TRACE_CANCELLED' : null; s.result.recovery = null
        s.result.completion_reason = s.discard ? 'cancelled' : op === 'duration' ? 'duration_limit' : 'requested'
      }
    } catch (error) {
      this.fail(s, reasonFor(error, s.recording?.recorder.alive() ? 'TRACE_STOP_FAILED' : 'TRACE_ARTIFACT_FAILED'))
      s.result.cleanup.status = 'failed'
      if (s.result.reason === 'STORAGE_LIMIT' && !s.recording?.recorder.alive()) await this.discardOversized(s)
    }
  }
  private async discardOversized(s: Session) {
    try {
      if (s.directory) await fs.rm(s.directory, { recursive: true, force: true })
      s.result.cleanup = { status: 'complete', remaining_resources: [] }; s.terminal = this.time.mono()
    } catch { /* retain failed cleanup and owned path for cancel retry */ }
  }
  private async finishRecorder(s: Session, op: string, timeout?: number) {
    if (!s.recording || s.recorderOk !== undefined) return
    const ended = await this.native.stop(s.recording, timeout)
    s.recorderOk = ended.code === 0 && !ended.timedOut
    if (ended.output.includes('[Warning]')) s.result.warnings = ['INSTRUMENTS_RUN_WARNING: one or more Instruments warnings; coverage may be incomplete.']
    if (!s.recorderOk && !s.discard) throw new Error(classifyTraceFailure(ended))
    if (op === 'duration' && !ended.output.includes('Reached specified time limit') && this.time.mono() < s.deadline && !s.discard) throw new Error('RECORDER_EXITED')
  }
  private async finishArtifact(s: Session) {
    if (!s.discard && !s.result.artifact) {
      if (!s.recording || !s.app || !s.recorderOk) throw new Error('RECORDER_EXITED')
      s.result.artifact = await this.native.validate(s.recording, s.result.device.id, s.app)
    }
    if (s.discard && s.directory) await fs.rm(s.directory, { recursive: true, force: true })
    else if (s.directory) await Promise.all(['notification', 'notification.c'].map(p => fs.rm(path.join(s.directory!, p), { force: true })))
  }
  async link(id: string, device: { platform: string; id: string }, correlation: string) {
    const s = this.get(id)
    if (device.platform !== 'ios' || device.id !== s.result.device.id) throw new TraceError('TRACE_NOT_FOUND')
    const status = await this.control(id, 'status')
    if (status.state !== 'recording') throw new TraceError('TRACE_NOT_FOUND')
    return this.serial(s, async () => {
      if (s.result.state !== 'recording' || !s.recording?.recorder.alive() || this.time.mono() >= s.deadline) throw new TraceError('TRACE_NOT_FOUND')
      if (!s.result.correlation_ids.includes(correlation)) {
        if (s.result.correlation_ids.length >= 1000) throw new TraceError('TRACE_BUSY')
        s.result.correlation_ids.push(correlation)
      }
      s.linked.add(correlation)
      let finished: Promise<{ trace_id: string; coverage: string; clock_alignment: string }> | undefined
      return () => finished ??= (async () => {
        let active = false
        try { active = (await this.control(id, 'status')).state === 'recording' } catch { /* unknown is partial */ }
        s.linked.delete(correlation)
        return { trace_id: id, coverage: !active || s.partial.has(correlation) ? 'partial' : 'covered', clock_alignment: 'unknown' }
      })()
    })
  }
  async shutdown() {
    this.closing = true
    this.native.shutdown()
    const active = [...this.sessions.values()].filter(s => s.result.cleanup.status !== 'complete')
    // Signal immediately even when an in-flight start/validation owns the serial queue.
    for (const s of active) s.recording?.recorder.signal('SIGINT')
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([Promise.allSettled(active.map(s => this.control(s.result.trace_id, 'cancel', 8000))),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 9000) })])
    if (timer) clearTimeout(timer)
    return active.filter(s => s.result.cleanup.status !== 'complete').map(s => this.snapshot(s))
  }
}
