import { checkDebuggerGuard } from '../debugger/guard.js'
import type { ScreenAccess } from './screen-assertion.js'
import type { DeviceTarget } from './observation.js'
export interface ScreenWaitInput extends DeviceTarget { previousFingerprint: string; timeoutMs?: number; pollIntervalMs?: number }
interface ScreenState { start: number; fingerprint: string | null; activity: string | null }
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
async function sample(s: ScreenState, input: ScreenWaitInput, interval: number, deps: Pick<ScreenAccess, 'fingerprint'>) {
  const response = await deps.fingerprint({ platform: input.platform, deviceId: input.deviceId })
  const fingerprint = response?.fingerprint ?? null
  s.activity = response?.activity ?? s.activity
  if (fingerprint == null) { s.fingerprint = null; await sleep(interval); return 'continue' as const }
  s.fingerprint = fingerprint
  if (fingerprint === input.previousFingerprint) return null
  await sleep(interval)
  try {
    const confirm = await deps.fingerprint({ platform: input.platform, deviceId: input.deviceId })
    const confirmed = confirm?.fingerprint ?? null
    s.activity = confirm?.activity ?? s.activity
    if (confirmed === fingerprint) return { success: true, previousFingerprint: input.previousFingerprint, newFingerprint: fingerprint,
      elapsedMs: Date.now() - s.start, observed_screen: { fingerprint, activity: s.activity } }
    s.fingerprint = confirmed
  } catch (error) { checkDebuggerGuard(); console.error('Error confirming fingerprint:', error) }
  return 'continue' as const
}
export async function waitForScreenChange({ platform, previousFingerprint, timeoutMs = 5000, pollIntervalMs = 300, deviceId }: ScreenWaitInput, deps: Pick<ScreenAccess, 'fingerprint'>) {
  const state: ScreenState = { start: Date.now(), fingerprint: null, activity: null }
  while (Date.now() - state.start < timeoutMs) {
    try {
      const result = await sample(state, { platform, previousFingerprint, deviceId }, pollIntervalMs, deps)
      if (result === 'continue') continue
      if (result) return result
    } catch (error) { checkDebuggerGuard(); console.error('Error getting screen fingerprint:', error) }
    await sleep(pollIntervalMs)
  }
  return { success: false, reason: 'timeout', previousFingerprint, lastFingerprint: state.fingerprint,
    elapsedMs: Date.now() - state.start, observed_screen: { fingerprint: state.fingerprint, activity: state.activity } }
}
