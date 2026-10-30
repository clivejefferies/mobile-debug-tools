import { systemClock, type Clock } from '../../runtime/clock.js'
import type { ActionTargetResolved, ExpectStateResponse, TraceStep, UIElementState } from '../../types.js'
import type { DeviceTarget, ObserveUI } from '../observation.js'
import type { UiSelector } from '../../contracts/selector.js'
import type { AdjustmentDependencies } from '../adjustment/adjustment-context.js'
import { createTraceStep, nextActionId } from '../../runtime/action-results.js'
import type { StateComparison } from './state-comparison.js'
export interface StateInput extends DeviceTarget {
  selector?: UiSelector; element_id?: string; property: string; expected: ExpectStateResponse['expected_state']['expected']
  stabilization_window_ms?: number; stable_observation_count?: number; snapshot_stale_threshold_ms?: number; poll_interval_ms?: number; exact_budget?: boolean
}
export type StateDependencies = Pick<AdjustmentDependencies, 'getHandle' | 'currentHandle' | 'target'> & { observe: ObserveUI; clock?: Clock }
export function createStateAssertion({ selector, element_id, property, expected, platform, deviceId,
  stabilization_window_ms = 1000, stable_observation_count = 2, snapshot_stale_threshold_ms = 500,
  poll_interval_ms = 150, exact_budget = false }: StateInput, clock: Clock = systemClock) {
  const start = clock.now()
  return { clock, input: { selector, element_id, property, expected, platform, deviceId }, start,
    deadline: start + (exact_budget ? stabilization_window_ms : Math.max(500, stabilization_window_ms)),
    stableTarget: Math.max(1, Math.floor(stable_observation_count || 2)),
    delay: exact_budget ? Math.max(50, Math.min(poll_interval_ms || 150, 1000)) : Math.max(100, Math.min(poll_interval_ms || 150, 200)),
    stale: Math.max(300, Math.min(snapshot_stale_threshold_ms || 500, 800)), attempts: 0, stable: 0, reason: 'element not found',
    failure: 'ELEMENT_NOT_FOUND' as 'ELEMENT_NOT_FOUND' | 'UNKNOWN', element: null as (ActionTargetResolved & { state?: UIElementState | null }) | null,
    value: null as StateComparison['observedValue'], raw: null as StateComparison['rawValue'], id: element_id ?? null,
    trace: [] as TraceStep[], sequence: 0, resolveRecorded: false }
}
export type StateAssertion = ReturnType<typeof createStateAssertion>
export function recordState(s: StateAssertion, stage: TraceStep['stage'], result: TraceStep['result'], metadata: Record<string, unknown>) {
  s.trace.push(createTraceStep({ stage, timestamp: s.clock.now(), result, attemptIndex: s.sequence++, metadata }))
}
export function stabilizeState(s: StateAssertion, result: 'success' | 'retry', age: number | null, reason: string) {
  recordState(s, 'stabilize', result, { stabilization_attempts: s.attempts, stable_observation_count: s.stable, snapshot_freshness_ms: age, reason })
}
function trace(s: StateAssertion, outcome: 'success' | 'failure') {
  return { action_id: nextActionId('expect_state', s.clock.now()), steps: s.trace, final_outcome: outcome, attempts: s.attempts }
}
export function stateSuccess(s: StateAssertion, comparison: StateComparison, age: number | null): ExpectStateResponse {
  return { success: true, selector: s.input.selector, element_id: s.id,
    expected_state: { property: s.input.property, expected: s.input.expected }, element: s.element,
    observed_state: { property: s.input.property, value: comparison.observedValue, ...(comparison.rawValue !== null ? { raw_value: comparison.rawValue } : {}) },
    reason: comparison.reason, stabilization_attempts: s.attempts, stabilization_window_ms: s.clock.now() - s.start,
    stable_observation_count: s.stable, snapshot_freshness_ms: age ?? undefined, trace: trace(s, 'success') }
}
export function stateFailure(s: StateAssertion): ExpectStateResponse {
  return { success: false, selector: s.input.selector, element_id: s.id,
    expected_state: { property: s.input.property, expected: s.input.expected }, element: s.element,
    observed_state: { property: s.input.property, value: s.value, ...(s.raw !== null ? { raw_value: s.raw } : {}) },
    reason: s.reason, failure_code: s.failure, retryable: true, trace: trace(s, 'failure') }
}
