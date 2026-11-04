import { TraceError } from './system-trace-error.js'
import type { SystemTraceSessions, TraceResult } from './system-trace.js'
import { IosTraceSessions, type IosTraceResult } from './ios-trace/sessions.js'
import { IosTraceNative } from './ios-trace/native.js'
import type { IosTemplate } from './ios-trace/capabilities.js'

interface Route { platform: 'android' | 'ios'; device: string; active: boolean; touched: number }
export class SystemTraceRouter {
  private routes = new Map<string, Route>()
  private pending = new Set<string>()
  private closing = false
  constructor(private android: SystemTraceSessions, private ios = new IosTraceSessions(), private native = new IosTraceNative()) {}
  capabilities(device: string) { return this.android.capabilities(device) }
  iosCapabilities(device: string, appId?: string, template?: IosTemplate) { return this.native.capabilities(device, appId, template) }
  private backend(platform: string) { return platform === 'ios' ? this.ios : this.android }
  private track(result: TraceResult | IosTraceResult) {
    this.routes.set(result.trace_id, { platform: result.device.platform, device: result.device.id,
      active: result.cleanup.status !== 'complete', touched: performance.now() })
    const terminal = [...this.routes.entries()].filter(([, r]) => !r.active)
    for (const [index, [id, r]] of terminal.entries()) if (performance.now() - r.touched > 600000 || index < terminal.length - 100) this.routes.delete(id)
    return result
  }
  async start(device: string, duration?: number, ios?: { appId: string; template?: IosTemplate }) {
    if (this.closing) throw new TraceError('TRACE_BUSY')
    // Refresh automatically finalised reservations without trusting cached state.
    await Promise.all([...this.routes.entries()].filter(([, r]) => r.active).map(async ([id, r]) => {
      try { this.track(await this.backend(r.platform).control(id, 'status')) }
      catch { /* uncertain cleanup continues to reserve capacity */ }
    }))
    const key = (ios ? 'ios:' : 'android:') + device
    const active = [...this.routes.values()].filter(r => r.active)
    if (this.closing || this.pending.has(key) || active.some(r => r.platform + ':' + r.device === key) || active.length + this.pending.size >= 4) throw new TraceError('TRACE_BUSY')
    this.pending.add(key)
    try {
      if (!ios) return this.track(await this.android.start(device, duration))
      const cap = await this.native.capabilities(device, ios.appId, ios.template)
      if (!cap.supported || !cap.device) throw new TraceError('TRACE_UNSUPPORTED')
      if (this.closing) throw new TraceError('TRACE_BUSY')
      return this.track(await this.ios.start(cap.device, ios.appId, duration))
    } finally { this.pending.delete(key) }
  }
  async control(id: string, operation: 'status' | 'stop' | 'cancel' | 'duration') {
    const route = this.routes.get(id)
    if (!route) throw new TraceError('TRACE_NOT_FOUND')
    return this.track(await this.backend(route.platform).control(id, operation))
  }
  async link(id: string, device: { platform: string; id: string }, correlation: string) {
    const route = this.routes.get(id)
    if (!route || route.platform !== device.platform || route.device !== device.id) throw new TraceError('TRACE_NOT_FOUND')
    return this.backend(route.platform).link(id, device, correlation)
  }
  async shutdown() {
    this.closing = true
    this.native.shutdown()
    const results = await Promise.allSettled([this.android.shutdown(), this.ios.shutdown()])
    if (results.some(result => result.status === 'rejected')) throw new TraceError('TRACE_STOP_FAILED')
    const remaining: (TraceResult | IosTraceResult)[] = []
    for (const result of results) if (result.status === 'fulfilled') remaining.push(...result.value)
    return remaining
  }
}
