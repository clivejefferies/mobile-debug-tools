import type { UiSelector as ExpectElementSelectorArg } from '../../contracts/selector.js'

import { ToolsInteract } from '../../interact/index.js'
import { ToolsObserve } from '../../observe/index.js'


import type { PlatformArg } from './handler-types.js'

export async function expectElementAbsent({ selector, timeoutMs, pollIntervalMs, platform, deviceId }: { selector: ExpectElementSelectorArg, timeoutMs: number, pollIntervalMs: number, platform: PlatformArg, deviceId?: string }) {
  const deadline = performance.now() + timeoutMs
  let consecutive = 0
  let observed: import('../../interact/waits/ui-wait-state.js').UIWaitResult['observed']
  while (performance.now() < deadline) {
    const result = await ToolsInteract.waitForUIHandler({ selector, condition: 'not_exists', timeout_ms: 0, singleObservation: true, singleAttempt: true, platform, deviceId })
    observed = result!.observed
    consecutive = result!.status === 'success' ? consecutive + 1 : 0
    if (consecutive === 2 && performance.now() <= deadline) return { success: true, observed }
    const delay = Math.max(100, pollIntervalMs)
    if (performance.now() + delay >= deadline) break
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  return { success: false, failure_code: 'ASSERTION_TIMEOUT', observed }
}

export async function expectFingerprint({ fingerprint, timeoutMs, platform, deviceId }: { fingerprint: string, timeoutMs: number, platform: PlatformArg, deviceId?: string }) {
  const deadline = performance.now() + timeoutMs
  let consecutive = 0
  let observed: string | null = null
  while (performance.now() < deadline) {
    const result = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId })
    observed = result?.fingerprint ?? null
    consecutive = observed === fingerprint ? consecutive + 1 : 0
    if (consecutive === 2 && performance.now() <= deadline) return { success: true, observed_fingerprint: observed }
    if (performance.now() + 100 >= deadline) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return { success: false, failure_code: 'ASSERTION_TIMEOUT', observed_fingerprint: observed }
}

