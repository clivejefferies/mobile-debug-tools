import { pausedReadiness } from '../debugger/guard.js'
import type { DeviceInfo } from '../types.js'
import { resolveTargetDevice, withResolvedDevice } from '../utils/resolve-device.js'
import { remainingBudget, runWithBudget } from '../utils/operation-budget.js'
import { ToolsObserve } from './index.js'
import { isDeviceUnavailable, ReadinessTracker, withReadinessTracker } from './readiness.js'

type Target = { platform?: 'android' | 'ios'; deviceId?: string }
function budgetExpired(error: unknown) {
  if (/ACTION_TIMEOUT/.test(String(error))) return true
  try { remainingBudget(); return false } catch { return true }
}
async function resolve(target: Target) {
  if (target.platform) return resolveTargetDevice({ ...target, platform: target.platform })
  try { return await resolveTargetDevice({ ...target, platform: 'android' }) }
  catch { return resolveTargetDevice({ ...target, platform: 'ios' }) }
}
export async function readinessDelay(ms: number) {
  await new Promise(resolve => setTimeout(resolve, Math.min(ms, remainingBudget(ms))))
  remainingBudget()
}

export async function getAppReadiness(args: Target & { timeoutMs?: number; stabilityMs?: number; pollIntervalMs?: number }, wait = false) {
  const started = performance.now()
  let device: DeviceInfo | null = null
  let tracker = new ReadinessTracker(args.platform ?? 'android', args.deviceId ?? '')
  let failureCode: string | undefined
  let debugPause: ReturnType<typeof pausedReadiness> = null
  await runWithBudget(args.timeoutMs ?? (wait ? 30000 : 15000), async () => {
    try {
      device = await resolve(args)
      remainingBudget()
      tracker = new ReadinessTracker(device.platform, device.id, args.stabilityMs ?? 500)
      await withResolvedDevice(device, async () => {
        let count = 0
        while (wait || count < 2) {
          remainingBudget()
          debugPause = device!.platform === 'android' ? pausedReadiness(device!.id) : null
          if (debugPause) { failureCode = wait ? 'DEBUGGER_PAUSED' : undefined; return }
          const captureStarted = Date.now()
          try {
            const tree = await ToolsObserve.getUITreeHandler({ platform: device!.platform as 'android' | 'ios', deviceId: device!.id })
            remainingBudget()
            tracker.observe(tree, captureStarted)
            if (isDeviceUnavailable(tree?.error)) { failureCode = 'DEVICE_UNAVAILABLE'; return }
          } catch (error) {
            if (/ACTION_TIMEOUT/.test(String(error))) throw error
            tracker.unavailable()
            if (isDeviceUnavailable(error)) { failureCode = 'DEVICE_UNAVAILABLE'; return }
          }
          count++
          if (tracker.summary.state === 'settled' || (!wait && tracker.summary.state === 'loading')) return
          if (!wait && count === 2) return
          await readinessDelay(wait ? args.pollIntervalMs ?? 500 : args.stabilityMs ?? 500)
        }
      })
    } catch (error) {
      const expired = budgetExpired(error)
      if (expired) tracker.deadline()
      else tracker.unavailable()
      failureCode = !expired && (!device || isDeviceUnavailable(error)) ? 'DEVICE_UNAVAILABLE' : wait ? 'READINESS_TIMEOUT' : 'READINESS_UNAVAILABLE'
    }
  })
  if (debugPause) return { success: !wait, device, readiness: debugPause, elapsed_ms: performance.now() - started, ...(wait ? { failure_code: 'DEBUGGER_PAUSED' } : {}) }
  const state = tracker.summary.state
  const success = !failureCode && (wait ? state === 'settled' : state !== 'unknown')
  return {
    success, device, readiness: tracker.summary, elapsed_ms: performance.now() - started,
    ...(!success ? { failure_code: failureCode ?? (wait ? 'READINESS_TIMEOUT' : 'READINESS_UNAVAILABLE') } : {})
  }
}

export async function withReadyWait<T extends object | undefined, F extends object>(target: Target, timeoutMs: number, operation: (device: DeviceInfo) => Promise<T>, failure: (code: string, elapsedMs: number, samples: number) => F) {
  const started = performance.now()
  let tracker = new ReadinessTracker(target.platform ?? 'android', target.deviceId ?? '')
  let resolved = false
  return runWithBudget(timeoutMs, async () => {
    try {
      const device = await resolve(target)
      resolved = true
      remainingBudget()
      tracker = new ReadinessTracker(device.platform, device.id)
      const result = await withResolvedDevice(device, () => withReadinessTracker(tracker, () => operation(device)))
      try { remainingBudget() } catch {
        const alreadyFailed = result && (('status' in result && result.status !== 'success') || ('success' in result && result.success === false))
        return { ...(alreadyFailed ? result : failure('TIMEOUT', performance.now() - started, tracker.summary.sample_count)), readiness: tracker.deadline() }
      }
      return { ...result, readiness: tracker.summary }
    } catch (error) {
      const expired = budgetExpired(error)
      if (expired) tracker.deadline()
      else tracker.unavailable()
      return { ...failure(!expired && (!resolved || isDeviceUnavailable(error)) ? 'DEVICE_UNAVAILABLE' : 'TIMEOUT', performance.now() - started, tracker.summary.sample_count), readiness: tracker.summary }
    }
  })
}
