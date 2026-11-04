import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getXcrunCmd } from '../../utils/ios/utils.js'
import { iosCapabilities, resolveIosApp, type IosApp, type IosTemplate } from './capabilities.js'
import { prepareNotification, listenNotification } from './notification.js'
import { spawnTrace, stopTraceChild, classifyTraceFailure, type TraceSpawn, type OwnedTraceChild } from './process.js'
import { traceSize, validateArtifact, IOS_TRACE_MAX_BYTES } from './artifact.js'

export interface IosRecording { recorder: OwnedTraceChild; file: string; ready_at_ms: number }
export class IosTraceNative {
  private spawn: TraceSpawn
  private children = new Set<OwnedTraceChild>()
  private recorders = new Set<OwnedTraceChild>()
  private closing = false
  constructor(spawn: TraceSpawn = spawnTrace) {
    this.spawn = (command, args, timeout) => {
      if (this.closing) throw new Error('TRACE_BUSY')
      const child = spawn(command, args, timeout)
      this.children.add(child)
      if (args.includes('xctrace') && args.includes('record')) this.recorders.add(child)
      void child.done.then(() => { this.children.delete(child); this.recorders.delete(child) })
      return child
    }
  }
  shutdown() {
    this.closing = true
    for (const child of this.children) child.signal('SIGINT')
    const helpers = setTimeout(() => { for (const child of this.children) if (!this.recorders.has(child)) child.signal('SIGKILL') }, 1000)
    const recorders = setTimeout(() => { for (const child of this.recorders) child.signal('SIGKILL') }, 8000)
    helpers.unref(); recorders.unref()
  }
  capabilities(device: string, appId?: string, template?: IosTemplate) { return iosCapabilities(device, appId, template, this.spawn) }
  resolve(device: string, app: string) { return resolveIosApp(device, app, this.spawn) }
  async storage(directory: string) {
    const stat = await fs.statfs(directory)
    if (stat.bavail * stat.bsize < 1024 * 1024 * 1024) throw new Error('STORAGE_LIMIT')
  }
  async start(device: string, app: IosApp, directory: string, duration: number, own: (recording: IosRecording) => void): Promise<IosRecording> {
    await this.storage(directory)
    const binary = await prepareNotification(directory, this.spawn)
    return this.startRecorder(device, app, directory, duration, binary, own)
  }
  private async startRecorder(device: string, app: IosApp, directory: string, duration: number, binary: string, own: (recording: IosRecording) => void) {
    const name = 'tools.mobiledebug.trace.' + randomUUID()
    const listener = await listenNotification(binary, name, this.spawn)
    let recording: IosRecording | undefined
    try {
      const current = await this.resolve(device, app.app_id)
      if (current.pid !== app.pid || current.executable !== app.executable || current.started_at !== app.started_at) throw new Error('APP_IDENTITY_CHANGED')
      const file = path.join(directory, 'capture.trace')
      const recorder = this.spawn(getXcrunCmd(), ['xctrace', 'record', '--template', 'Time Profiler', '--device', device,
        '--attach', String(app.pid), '--time-limit', `${duration}ms`, '--output', file, '--notify-tracing-started', name], duration + 65000)
      recording = { recorder, file, ready_at_ms: 0 }; own(recording)
      await Promise.race([listener.line('READY', 35000), recorder.done.then(result => { throw new Error(classifyTraceFailure(result)) })])
      if (!recorder.alive()) throw new Error('RECORDER_EXITED')
      recording.ready_at_ms = Date.now()
      return recording
    } catch (error) {
      if (recording) await stopTraceChild(recording.recorder).catch(() => {})
      throw error
    } finally { await stopTraceChild(listener, 1000).catch(() => {}) }
  }
  stop(recording: IosRecording, timeout?: number) { return stopTraceChild(recording.recorder, timeout) }
  async monitor(device: string, app: IosApp, recording: IosRecording) {
    const current = await this.resolve(device, app.app_id)
    if (current.pid !== app.pid || current.executable !== app.executable || current.started_at !== app.started_at) throw new Error('APP_IDENTITY_CHANGED')
    try { if (await traceSize(recording.file) > IOS_TRACE_MAX_BYTES) throw new Error('STORAGE_LIMIT') }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  }
  validate(recording: IosRecording, device: string, app: IosApp) { return validateArtifact(recording.file, device, app, this.spawn) }
}
