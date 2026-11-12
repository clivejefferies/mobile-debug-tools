import { randomUUID } from 'node:crypto'
import { resolveTargetDevice } from '../../utils/resolve-device.js'
import { adbTrace, publishApp, removeApp, TraceResources, validateApp } from './resources.js'
import { TraceBuffer, type TraceRecord } from './records.js'

const lifetime = 5 * 60 * 1000
const traceLimit = 8
const terminalLimit = 64

export type StartTrace = { deviceId: string; allowedHosts: string[]; appId?: string }

export class TraceCleanupError extends Error {
  constructor(readonly traceId: string) { super('HTTP_TRACE_CLEANUP_INCOMPLETE') }
}

type Session = {
  id: string
  input: StartTrace
  controller: AbortController
  resources: TraceResources
  appOwned: boolean
  records: TraceBuffer
  starting?: Promise<unknown>
  stopping?: Promise<StopResult>
  stopReason?: StopResult['reason']
  timer?: NodeJS.Timeout
  live: boolean
}
type StopResult = { traceId: string; cleanedUp: boolean; reason: 'stopped' | 'expired' | 'disconnected' | 'setup_failed' }

export class HttpTraceSessions {
  private readonly sessions = new Map<string, Session>()
  private readonly terminals = new Map<string, StopResult>()
  private shuttingDown = false

  async start(input: StartTrace, signal?: AbortSignal) {
    if (this.shuttingDown) throw new Error('HTTP_TRACE_UNAVAILABLE')
    if ([...this.sessions.values()].some(session => session.input.deviceId === input.deviceId)) {
      throw new Error('HTTP_TRACE_CONFLICT')
    }
    if (this.sessions.size >= traceLimit) throw new Error('HTTP_TRACE_LIMIT')
    const id = randomUUID()
    const controller = new AbortController()
    const resources = new TraceResources(input.deviceId, () => {
      if (session.live) void this.stop(id, 'disconnected')
      else if (!session.stopping) controller.abort()
    })
    const session: Session = { id, input, controller, resources, appOwned: false, records: new TraceBuffer(id), live: false }
    this.sessions.set(id, session)
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const starting = this.initialize(session, combined)
    session.starting = starting
    try {
      return await starting
    } catch (error) {
      const stopped = await this.stop(id, 'setup_failed')
      if (!stopped.cleanedUp) throw new TraceCleanupError(id)
      if (error instanceof Error && /^HTTP_TRACE_[A-Z_]+$/.test(error.message)) throw error
      throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE')
    } finally {
      session.starting = undefined
    }
  }

  private async initialize(session: Session, signal: AbortSignal) {
    const { input, id } = session
    let device
    try {
      device = await resolveTargetDevice({ platform: 'android', deviceId: input.deviceId })
      if (!device.simulator || device.id !== input.deviceId ||
          await adbTrace(device.id, ['shell', 'getprop', 'ro.kernel.qemu']) !== '1' ||
          await adbTrace(device.id, ['shell', 'getprop', 'sys.boot_completed']) !== '1') {
        throw new Error('Invalid target')
      }
    } catch {
      throw new Error('HTTP_TRACE_INVALID_TARGET')
    }
    if (input.appId) await validateApp(input.deviceId, input.appId)
    const proxy = await session.resources.start(input.allowedHosts, record => this.record(session, record), signal)
    signal.throwIfAborted()
    const expiresAt = Date.now() + lifetime
    const config = { ...proxy, traceId: id, proxyHost: '127.0.0.1', allowedHosts: input.allowedHosts, expiresAt }
    if (input.appId) {
      session.appOwned = true
      await publishApp(input.deviceId, input.appId, id, { ...config, version: 1 })
    }
    signal.throwIfAborted()
    session.live = true
    session.timer = setTimeout(() => { void this.stop(id, 'expired') }, Math.max(0, expiresAt - Date.now()))
    session.timer.unref()
    return { ...config, deviceId: input.deviceId, readiness: 'listening', appConfigured: session.appOwned }
  }

  private record(session: Session, record: TraceRecord) {
    if (!session.live) return
    session.records.append(record)
  }

  read(id: string, cursor: string | undefined, pageSize: number) {
    const session = this.sessions.get(id)
    if (!session?.live) {
      const reason = session?.stopReason ?? this.terminals.get(id)?.reason
      throw new Error(reason === 'expired' ? 'HTTP_TRACE_EXPIRED' : 'HTTP_TRACE_UNKNOWN')
    }
    return session.records.read(cursor, pageSize)
  }

  async stop(id: string, reason: StopResult['reason'] = 'stopped'): Promise<StopResult> {
    const session = this.sessions.get(id)
    if (!session) {
      const terminal = this.terminals.get(id)
      if (!terminal) throw new Error('HTTP_TRACE_UNKNOWN')
      return terminal
    }
    if (session.stopping) return session.stopping
    session.stopReason ??= reason
    session.live = false
    session.controller.abort()
    clearTimeout(session.timer)
    session.records.clear()
    session.stopping = this.cleanup(session, session.stopReason).finally(() => { session.stopping = undefined })
    return session.stopping
  }

  private async cleanup(session: Session, reason: StopResult['reason']): Promise<StopResult> {
    await session.starting?.catch(() => {})
    const { deviceId, appId } = session.input
    const results = await Promise.allSettled([
      session.resources.stop(),
      session.appOwned && appId && removeApp(deviceId, appId, session.id).then(() => { session.appOwned = false }),
    ])
    const cleanedUp = results.every(result => result.status === 'fulfilled')
    const outcome = { traceId: session.id, cleanedUp, reason }
    if (cleanedUp) {
      this.sessions.delete(session.id)
      this.terminals.set(session.id, outcome)
      if (this.terminals.size > terminalLimit) this.terminals.delete(this.terminals.keys().next().value!)
    }
    return outcome
  }

  async shutdown() {
    this.shuttingDown = true
    return Promise.all([...this.sessions.keys()].map(id => this.stop(id, 'disconnected')))
  }
}
