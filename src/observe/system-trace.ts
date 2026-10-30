import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AndroidTraceNative, TRACE_MAX_BYTES, type TraceCapabilities, type TraceNative, type TraceProcess } from './system-trace-android.js'
import { evidenceSessionId } from './evidence.js'
import { runWithBudget, remainingBudget } from '../utils/operation-budget.js'

export class TraceError extends Error {
  constructor(public code: string) { super(code) }
}
type State = 'starting' | 'recording' | 'stopping' | 'completed' | 'cancelled' | 'failed'
type Completion = 'requested' | 'duration_limit' | 'cancelled' | 'error'
export interface TraceResult {
  trace_id: string; session_id: string; device: { platform: 'android'; id: string }; backend: 'perfetto'
  state: State; reason: string | null; completion_reason: Completion | null
  capture_started_at_ms: number | null; capture_completed_at_ms: number | null
  artifact: { path: string; format: 'perfetto'; size_bytes: number } | null
  cleanup: { status: 'pending' | 'complete' | 'failed'; remaining_resources: string[] }
  correlation_ids: string[]; enabled_sources: string[]; unavailable_categories: string[]
}
interface Session {
  result: TraceResult; remote: string; owner: TraceProcess | null; stopped: boolean; discard: boolean
  timer?: ReturnType<typeof setTimeout>; terminalAt?: number; deadline: number; local?: string
  queue: Promise<unknown>; linked: Set<string>; partial: Set<string>
}
export interface TraceClock {
  wall(): number; mono(): number; sleep(ms: number): Promise<void>
  schedule(fn: () => void, ms: number): ReturnType<typeof setTimeout>
  clear(timer: ReturnType<typeof setTimeout>): void
}
const clock: TraceClock = {
  wall: Date.now, mono: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  schedule: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t }, clear: clearTimeout
}

export class SystemTraceSessions {
  private sessions = new Map<string, Session>()
  private closing = false
  constructor(private native: TraceNative = new AndroidTraceNative(), private time: TraceClock = clock) { }
  private prune() {
    const terminal = [...this.sessions.values()].filter(s => s.terminalAt !== undefined && s.result.cleanup.status === 'complete')
    for (const s of terminal) if (this.time.mono() - s.terminalAt! >= 600000) this.sessions.delete(s.result.trace_id)
    const remaining = terminal.filter(s => this.sessions.has(s.result.trace_id))
    for (const s of remaining.slice(0, Math.max(0, remaining.length - 100))) this.sessions.delete(s.result.trace_id)
  }

  private get(id: string) { this.prune(); const s = this.sessions.get(id); if (!s) throw new TraceError('TRACE_NOT_FOUND'); return s }
  private snapshot(s: Session): TraceResult { return structuredClone(s.result) }
  private serial<T>(s: Session, fn: () => Promise<T>): Promise<T> {
    const result = s.queue.then(fn)
    s.queue = result.catch(() => { })
    return result
  }
  async capabilities(device: string) { return this.native.capabilities(device) }
  async start(device: string, duration = 30000): Promise<TraceResult> {
    if (!Number.isInteger(duration) || duration < 1000 || duration > 120000) throw new TraceError('INVALID_ARGUMENT')
    this.prune()
    const reserved = [...this.sessions.values()].filter(s => s.result.cleanup.status !== 'complete')
    if (this.closing || reserved.length >= 4 || reserved.some(s => s.result.device.id === device)) throw new TraceError('TRACE_BUSY')
    const id = randomUUID()
    const result: TraceResult = {
      trace_id: id, session_id: evidenceSessionId(), device: { platform: 'android', id: device }, backend: 'perfetto',
      state: 'starting', reason: null, completion_reason: null, capture_started_at_ms: null, capture_completed_at_ms: null,
      artifact: null, cleanup: { status: 'pending', remaining_resources: [] }, correlation_ids: [], enabled_sources: [], unavailable_categories: []
    }
    const s: Session = {
      result, remote: `/data/misc/perfetto-traces/mcp-${id}.perfetto-trace`, owner: null, stopped: true,
      discard: false, deadline: Infinity, queue: Promise.resolve(), linked: new Set(), partial: new Set()
    }
    this.sessions.set(id, s)
    return this.serial(s, async () => {
      let cap: TraceCapabilities
      try { cap = await this.native.capabilities(device) }
      catch { this.fail(s, 'TRACE_UNSUPPORTED'); this.clean(s); return this.snapshot(s) }
      s.result.enabled_sources = cap.enabled_sources
      s.result.unavailable_categories = cap.unavailable_categories
      if (!cap.supported || this.closing) { this.fail(s, this.closing ? 'TRACE_BUSY' : 'TRACE_UNSUPPORTED'); this.clean(s); return this.snapshot(s) }
      s.stopped = false
      s.result.cleanup.remaining_resources = [s.remote, 'device_capture']
      // Conservative host bounds include acknowledgement latency, not exact device start.
      s.result.capture_started_at_ms = this.time.wall()
      s.deadline = this.time.mono() + duration
      try {
        await this.native.start(device, s.remote, duration, cap.enabled_sources)
        s.owner = await this.native.find(device, s.remote)
        s.result.state = 'recording'
        s.timer = this.time.schedule(() => { void this.control(id, 'duration').catch(() => { }) }, Math.max(0, s.deadline - this.time.mono()))
      } catch (error) {
        s.discard = true
        this.fail(s, this.code(error, 'TRACE_START_FAILED'))
        try { await this.halt(s); await this.remove(s) } catch { s.result.cleanup.status = 'failed' }
      }
      return this.snapshot(s)
    })
  }
  private code(error: unknown, fallback: string) { return error instanceof Error && error.message === 'ACTION_TIMEOUT' ? 'ACTION_TIMEOUT' : fallback }
  private fail(s: Session, reason: string) {
    s.result.state = 'failed'; s.result.reason = reason; s.result.completion_reason = 'error'
    s.terminalAt = this.time.mono()
  }
  private clean(s: Session) {
    s.result.cleanup = { status: 'complete', remaining_resources: [] }
    s.terminalAt = this.time.mono()
    this.prune()
  }
  private async halt(s: Session) {
    if (s.stopped) return
    const deadline = this.time.mono() + 10000
    await runWithBudget(10000, async () => {
      const found = await this.native.find(s.result.device.id, s.remote)
      if (found) {
        if (s.owner && (s.owner.pid !== found.pid || s.owner.startTime !== found.startTime)) throw new TraceError('TRACE_STOP_FAILED')
        s.owner ??= found
        try { await this.native.stop(s.result.device.id, s.remote, s.owner) }
        catch (error) {
          // Natural expiry can win between identity lookup and SIGTERM. Only
          // confirmed absence permits finalisation; unreadable/reused identity fails.
          if (await this.native.find(s.result.device.id, s.remote)) throw error
        }
        while (await this.native.find(s.result.device.id, s.remote)) {
          if (this.time.mono() >= deadline) throw new TraceError('ACTION_TIMEOUT')
          remainingBudget(); await this.time.sleep(100)
        }
      }
    })
    s.stopped = true
    s.result.capture_completed_at_ms = this.time.wall()
    s.result.cleanup.remaining_resources = [s.remote]
    for (const linked of s.linked) s.partial.add(linked)
  }
  private async remove(s: Session) {
    if (!s.stopped) throw new TraceError('TRACE_STOP_FAILED')
    await this.native.remove(s.result.device.id, s.remote)
    if (s.local && !s.result.artifact) { await fs.rm(s.local, { recursive: true, force: true }); s.local = undefined }
    this.clean(s)
  }
  private async artifact(s: Session) {
    if (s.result.artifact) return
    s.local ??= await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-debug-trace-'))
    const local = s.local
    const partial = path.join(local, 'capture.partial')
    try {
      await fs.chmod(s.local, 0o700)
      await this.native.pull(s.result.device.id, s.remote, partial)
      const stat = await fs.stat(partial)
      if (!stat.isFile() || stat.size <= 0 || stat.size > TRACE_MAX_BYTES) throw new TraceError('TRACE_ARTIFACT_FAILED')
      await fs.chmod(partial, 0o600)
      const target = path.join(s.local, `${s.result.trace_id}.perfetto-trace`)
      await fs.rename(partial, target)
      s.result.artifact = { path: target, format: 'perfetto', size_bytes: stat.size }
    } catch (error) {
      try { await fs.rm(local, { recursive: true, force: true }); s.local = undefined }
      catch { s.result.cleanup.remaining_resources = [s.remote, local] }
      throw error
    }
  }
  async control(id: string, operation: 'status' | 'stop' | 'cancel' | 'duration'): Promise<TraceResult> {
    const s = this.get(id)
    return this.serial(s, async () => {
      if (s.result.cleanup.status === 'complete') return this.snapshot(s)
      if (operation === 'status' && s.result.state === 'recording') {
        try {
          if (await this.native.find(s.result.device.id, s.remote) && this.time.mono() < s.deadline) return this.snapshot(s)
        } catch (error) { this.fail(s, this.code(error, 'TRACE_STOP_FAILED')); s.result.cleanup.status = 'failed'; return this.snapshot(s) }
      }
      if (s.timer) { this.time.clear(s.timer); s.timer = undefined }
      if (operation === 'cancel') s.discard = true
      const hadStartFailure = s.discard && s.result.state === 'failed' && operation !== 'cancel'
      s.result.state = 'stopping'
      s.result.cleanup.status = 'pending'
      try { await this.halt(s) }
      catch (error) { this.fail(s, this.code(error, 'TRACE_STOP_FAILED')); s.result.cleanup.status = 'failed'; return this.snapshot(s) }
      if (!s.discard) {
        try { await this.artifact(s) }
        catch (error) { this.fail(s, this.code(error, 'TRACE_ARTIFACT_FAILED')); s.result.cleanup.status = 'failed'; return this.snapshot(s) }
      }
      try { await this.remove(s) }
      catch { this.fail(s, 'TRACE_STOP_FAILED'); s.result.cleanup.status = 'failed'; return this.snapshot(s) }
      this.complete(s, hadStartFailure, operation)
      return this.snapshot(s)
    })
  }
  private complete(s: Session, hadStartFailure: boolean, operation: string) {
    if (hadStartFailure) s.result.state = 'failed'
    else {
      s.result.state = s.discard ? 'cancelled' : 'completed'
      s.result.reason = s.discard ? 'TRACE_CANCELLED' : null
      s.result.completion_reason = s.discard ? 'cancelled' : operation === 'duration' || this.time.mono() >= s.deadline ? 'duration_limit' : 'requested'
    }
  }
  async link(id: string, device: { platform: string; id: string }, correlation: string) {
    const s = this.get(id)
    if (device.platform !== 'android' || device.id !== s.result.device.id) throw new TraceError('TRACE_NOT_FOUND')
    const status = await this.control(id, 'status')
    if (device.platform !== 'android' || device.id !== status.device.id || status.state !== 'recording') throw new TraceError('TRACE_NOT_FOUND')
    // Validate again after the asynchronous status call: stop/cancel may have won.
    return this.serial(s, async () => {
      if (s.result.state !== 'recording' || this.time.mono() >= s.deadline) throw new TraceError('TRACE_NOT_FOUND')
      if (!s.result.correlation_ids.includes(correlation)) {
        if (s.result.correlation_ids.length >= 1000) throw new TraceError('TRACE_BUSY')
        s.result.correlation_ids.push(correlation)
      }
      s.linked.add(correlation)
      let finish: Promise<{ trace_id: string; coverage: string; clock_alignment: string }> | undefined
      return () => finish ??= (async () => {
        let recording = false
        try { recording = (await this.control(id, 'status')).state === 'recording' }
        catch { /* Unavailable state cannot establish complete coverage. */ }
        s.linked.delete(correlation)
        return {
          trace_id: id, coverage: !recording || s.partial.has(correlation) || this.time.mono() >= s.deadline ? 'partial' : 'covered',
          clock_alignment: 'unknown'
        }
      })()
    })
  }
  async shutdown() {
    this.closing = true
    // Independent device cleanup in parallel under one overall deadline.
    return runWithBudget(10000, async () => {
      await Promise.allSettled([...this.sessions.values()].filter(s => s.result.cleanup.status !== 'complete').map(s => this.control(s.result.trace_id, 'cancel')))
      return [...this.sessions.values()].filter(s => s.result.cleanup.status !== 'complete').map(s => this.snapshot(s))
    })
  }
}
export const systemTraces = new SystemTraceSessions()
