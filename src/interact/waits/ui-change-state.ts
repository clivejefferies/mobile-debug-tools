import { systemClock, type Clock } from '../../runtime/clock.js'
import type { LoadingState, WaitForUIChangeResponse } from '../../types.js'
import type { DeviceTarget } from '../observation.js'
import type { UiChangeSignatureSet, UiChangeScopeResult, UiChangeScopeResolution } from '../model.js'
import { _summarizeUiChangeDelta } from './ui-change-helpers.js'
import { currentReadinessWait } from '../../observe/readiness.js'
export interface ChangeInput extends DeviceTarget {
  timeout_ms?: number; stability_window_ms?: number; expected_change?: 'hierarchy_diff' | 'text_change' | 'state_change'; scope?: 'screen' | 'subtree'; target?: string | null
}
export function createChangeWait({ platform, deviceId, timeout_ms = 60000, stability_window_ms = 300, expected_change, scope = 'screen', target = null }: ChangeInput, clock: Clock = systemClock) {
  const tracker = currentReadinessWait(), start = clock.now()
  return { clock, input: { platform, deviceId, timeout_ms, expected_change, scope, target }, tracker, start,
    stability: Math.max(0, typeof stability_window_ms === 'number' ? stability_window_ms : 300), baseline: null as UiChangeSignatureSet | null,
    baselineScope: null as UiChangeScopeResult | null, revision: null as number | null, loading: null as LoadingState | null,
    age: null as number | null, candidate: null as UiChangeSignatureSet | null, change: null as WaitForUIChangeResponse['observed_change'],
    since: null as number | null, summary: null as ReturnType<typeof _summarizeUiChangeDelta> | null,
    scope: { scope: scope === 'subtree' ? 'subtree' : 'screen', target: target && typeof target === 'string' ? target : null,
      resolved: scope !== 'subtree', resolvedIndex: null, resolvedStableId: null, reason: scope === 'subtree' ? 'target not resolved yet' : 'screen scope' } as UiChangeScopeResolution }
}
export type ChangeWait = ReturnType<typeof createChangeWait>
export function changeResult(s: ChangeWait, success: boolean, reason: string): WaitForUIChangeResponse {
  return { success, observed_change: success ? s.change : null, snapshot_revision: s.revision ?? undefined,
    snapshot_freshness_ms: s.age ?? null, timeout: !success, elapsed_ms: s.clock.now() - s.start,
    expected_change: s.input.expected_change, loading_state: s.loading ?? null, scope: s.scope.scope, target: s.scope.target,
    stability_state: success ? 'stable' : 'transient', change_summary: s.summary, reason }
}
