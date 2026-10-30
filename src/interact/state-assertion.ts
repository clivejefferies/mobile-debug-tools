import type { UiTree } from './observation.js'
import type { ExpectStateResponse } from '../types.js'
import { _findFirstMatchingElement } from './element-helpers.js'
import { compareReadableState } from './state-comparison.js'
import { createStateAssertion, recordState, stabilizeState, stateSuccess, stateFailure,
  type StateInput, type StateDependencies, type StateAssertion } from './state-assertion-context.js'

function matchState(s: StateAssertion, tree: UiTree, deps: StateDependencies) {
  const elements = Array.isArray(tree?.elements) ? tree.elements : []
  const platform = tree?.device?.platform === 'ios' ? 'ios' : s.input.platform || 'android'
  const deviceId = tree?.device?.id || s.input.deviceId
  const age = typeof tree?.captured_at_ms === 'number' ? Date.now() - tree.captured_at_ms : null
  let matched = null
  if (s.input.element_id) {
    const handle = deps.getHandle(s.input.element_id)
    if (handle) {
      const current = deps.currentHandle(elements, platform, deviceId, handle)
      if (current) matched = { el: current.el, idx: current.index }
    }
  }
  if (!matched && s.input.selector) matched = _findFirstMatchingElement(elements, s.input.selector)
  return { matched, platform, deviceId, age }
}
function retryResolution(s: StateAssertion, matched: boolean, age: number | null) {
  s.reason = matched ? 'stale snapshot' : 'element not found'
  s.failure = matched ? 'UNKNOWN' : 'ELEMENT_NOT_FOUND'; s.stable = 0
  recordState(s, 'resolve', 'retry', { selector: s.input.selector ?? null, element_id: s.id, matched, reason: s.reason, attempt: s.attempts })
  stabilizeState(s, 'retry', age, s.reason)
}
async function sample(s: StateAssertion, deps: StateDependencies): Promise<ExpectStateResponse | null> {
  s.attempts++
  const tree = await deps.observe({ platform: s.input.platform, deviceId: s.input.deviceId })
  const { matched, platform, deviceId, age } = matchState(s, tree, deps)
  if (!matched) { retryResolution(s, false, age); return null }
  const element = deps.target(platform, deviceId, matched)
  s.id = element.elementId; s.element = { ...element, state: matched.el.state ?? null }
  if (age !== null && age > s.stale) { retryResolution(s, true, age); return null }
  if (!s.resolveRecorded) {
    recordState(s, 'resolve', 'success', { selector: s.input.selector ?? null, element_id: s.id, matched: true, reason: 'element resolved' })
    s.resolveRecorded = true
  }
  const comparison = compareReadableState(s.input.property, s.input.expected, matched.el.state ?? null)
  if (comparison.success) {
    s.stable++
    stabilizeState(s, 'success', age, comparison.reason)
    recordState(s, 'verify', 'success', { property: s.input.property, expected: s.input.expected, observed_value: comparison.observedValue, reason: comparison.reason })
    if (s.stable >= s.stableTarget) return stateSuccess(s, comparison, age)
  } else {
    s.stable = 0; s.reason = comparison.reason || s.reason; s.failure = 'UNKNOWN'
    stabilizeState(s, 'retry', age, s.reason)
    recordState(s, 'verify', 'retry', { property: s.input.property, expected: s.input.expected, observed_value: comparison.observedValue, reason: s.reason })
    s.value = comparison.observedValue; s.raw = comparison.rawValue
  }
  return null
}
export async function expectState(input: StateInput, deps: StateDependencies): Promise<ExpectStateResponse> {
  const state = createStateAssertion(input)
  while (Date.now() <= state.deadline) {
    const result = await sample(state, deps)
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, state.delay))
  }
  return stateFailure(state)
}
