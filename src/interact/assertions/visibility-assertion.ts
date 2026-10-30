import type { UiSelector } from '../../contracts/selector.js'
import type { ActionTargetResolved, ExpectElementVisibleResponse } from '../../types.js'
import type { DeviceTarget } from '../observation.js'
import type { UIWaitInput, UIWaitResult } from '../waits/ui-wait-state.js'
import { buildObservationTrace } from '../interaction-trace.js'
export interface VisibilityInput extends DeviceTarget { selector: UiSelector; element_id?: string; timeout_ms?: number; poll_interval_ms?: number }
export type WaitUI = (input: UIWaitInput) => Promise<UIWaitResult | undefined>
function visibleElement(element: ActionTargetResolved): ActionTargetResolved {
  return { elementId: element.elementId ?? null, text: element.text ?? null, resource_id: element.resource_id ?? null,
    accessibility_id: element.accessibility_id ?? null, class: element.class ?? null, bounds: element.bounds ?? null,
    index: typeof element.index === 'number' ? element.index : null, state: element.state ?? null,
    stable_id: element.stable_id ?? null, role: element.role ?? null, test_tag: element.test_tag ?? null,
    selector: element.selector ?? null, semantic: element.semantic ?? null }
}
function visibleSuccess(input: VisibilityInput, result: UIWaitResult, element: ActionTargetResolved): ExpectElementVisibleResponse {
  const id = element.elementId ?? input.element_id ?? null
  return { success: true, selector: input.selector, element_id: id, expected_condition: 'visible', element: visibleElement(element),
    observed: { status: result.status, matched_count: typeof result.matched === 'number' ? result.matched : result.observed?.matched_count ?? null,
      condition_satisfied: true, selected_index: typeof element.index === 'number' ? element.index : null, last_matched_element: visibleElement(element) },
    reason: 'selector is visible', trace: buildObservationTrace({ actionType: 'expect_element_visible', stage: 'verify', success: true, attempts: 1,
      metadata: { selector: input.selector, element_id: id, status: result.status } }) }
}
function visibleFailure(input: VisibilityInput, result: UIWaitResult | undefined): ExpectElementVisibleResponse {
  const code = result?.error?.code === 'INTERNAL_ERROR' ? 'UNKNOWN' : 'TIMEOUT'
  const reason = result?.error?.message ?? 'selector is not visible'
  return { success: false, selector: input.selector, element_id: input.element_id ?? null, expected_condition: 'visible',
    observed: failureObserved(result), reason, failure_code: code, retryable: code === 'TIMEOUT',
    trace: buildObservationTrace({ actionType: 'expect_element_visible', stage: 'verify', success: false, attempts: 1,
      metadata: { selector: input.selector, element_id: input.element_id ?? null, status: result?.status ?? null, reason } }) }
}
export async function expectVisible({ selector, element_id, timeout_ms = 5000, poll_interval_ms = 300, platform, deviceId }: VisibilityInput, wait: WaitUI) {
  const result = await wait({ selector, condition: 'visible', timeout_ms, poll_interval_ms, platform, deviceId })
  const input = { selector, element_id, platform, deviceId }
  return result?.status === 'success' && result.element ? visibleSuccess(input, result, result.element) : visibleFailure(input, result)
}

function failureObserved(result: UIWaitResult | undefined) {
  return { status: result?.status, matched_count: result?.observed?.matched_count,
    condition_satisfied: result?.observed?.condition_satisfied ?? false,
    selected_index: result?.observed?.selected_index ?? null, last_matched_element: result?.observed?.last_matched_element ?? null }
}
