import { AsyncLocalStorage } from 'node:async_hooks'
import { DebuggerError } from './worker.js'
interface PauseEvidence {
  debug_session_id: string
  captured_at_ms: number
  target: unknown
}
let pauseProvider: (device: string) => PauseEvidence | null = () => null
export function registerDebuggerPauseProvider(provider: typeof pauseProvider) { pauseProvider = provider }
const context = new AsyncLocalStorage<{ platform: string; device: string; dispatched: boolean }>()
export function withDebuggerGuard<T>(platform: string, device: string, operation: () => Promise<T>) {
  return context.run({ platform, device, dispatched: false }, operation)
}
// Synchronous checks and native submission share a JS turn with pause updates.
export function checkDebuggerGuard(dispatch = false) {
  const current = context.getStore()
  if (!current || current.platform !== 'android') return
  if (pauseProvider(current.device)) throw new DebuggerError('DEBUGGER_PAUSED')
  if (dispatch) current.dispatched = true
}
export function guardDispatched() { return context.getStore()?.dispatched ?? false }
export function pausedReadiness(device: string) {
  const paused = pauseProvider(device)
  if (!paused) return null
  return { state: 'debugger_paused' as const, scope: 'device_ui' as const, basis: 'observed' as const,
    captured_at_ms: paused.captured_at_ms, sample_count: 0, stable_for_ms: 0, snapshot_session_id: null, snapshot_revision: null,
    evidence: [{ code: 'DEBUGGER_PAUSED', source: 'debugger', captured_at_ms: paused.captured_at_ms, snapshot_revision: null }],
    limitations: ['FOREGROUND_APP_UNVERIFIED', 'DEVICE_WIDE_UI_GUARD'],
    capabilities: { loading: true, transitioning: true, settled: true, unresponsive: false, debugger_paused: true },
    debug_session_id: paused.debug_session_id, target: paused.target }
}
