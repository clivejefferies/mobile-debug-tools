import type { UiSelector } from '../../contracts/selector.js'
import type { ControlWait } from './adjustment-context.js'
import type { FindElementResponse } from '../../types.js'
import type { UiElement } from '../model.js'
import { _normalizeBounds, _isAdjustableControl, _findFirstMatchingElement, _isAdjustableActionable } from '../targeting/element-helpers.js'
import { planAdjustment } from './adjustment-plan.js'
import { failAdjustment, recordAdjustment, succeedAdjustment, type AdjustmentState, type AdjustmentDependencies, type ControlMatch, type Iteration } from './adjustment-context.js'

function fallbackBounds(fallback: FindElementResponse['element']) {
  const bounds = fallback?.bounds
  if (Array.isArray(bounds)) return _normalizeBounds(bounds)
  return bounds && typeof bounds === 'object' ? _normalizeBounds([Number(bounds.left), Number(bounds.top), Number(bounds.right), Number(bounds.bottom)]) : null
}
function findFallback(elements: UiElement[], fallback: FindElementResponse['element']) {
  const bounds = fallbackBounds(fallback)
  if (!bounds) return null
  let index = elements.findIndex(el => {
    const current = _normalizeBounds(el.bounds)
    return !!current && current.every((value, i) => value === bounds[i])
  })
  if (index === -1) index = nearestControl(elements, bounds)
  return index >= 0 && elements[index] ? { el: elements[index], idx: index } : null
}
function nearestControl(elements: UiElement[], bounds: [number, number, number, number]) {
  const x = Math.floor((bounds[0] + bounds[2]) / 2), y = Math.floor((bounds[1] + bounds[3]) / 2)
  let best = Infinity, index = -1
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!_isAdjustableControl(el)) continue
    const current = _normalizeBounds(el.bounds)
    if (!current) continue
    const distance = Math.abs(Math.floor((current[0] + current[2]) / 2) - x) + Math.abs(Math.floor((current[1] + current[3]) / 2) - y)
    if (distance < best) { best = distance; index = i }
  }
  return index
}
export async function resolveControl(s: AdjustmentState, deps: AdjustmentDependencies): Promise<ControlMatch | null> {
  const tree = await deps.observe(s.platform, s.deviceId)
  s.platform = tree?.device?.platform === 'ios' ? 'ios' : s.platform
  s.deviceId = tree?.device?.id || s.deviceId
  const elements = Array.isArray(tree?.elements) ? tree.elements : []
  let match = null
  if (s.input.element_id) {
    const stored = deps.getHandle(s.input.element_id)
    if (!stored) return null
    const current = deps.currentHandle(elements, s.platform, s.deviceId, stored)
    if (!current) return null
    match = { el: current.el, idx: current.index }
  } else {
    if (s.fallback) match = findFallback(elements, s.fallback)
    if (!match && s.input.selector) match = _findFirstMatchingElement(elements, s.input.selector)
  }
  return match ? { tree, device: tree?.device, match, resolvedTarget: deps.target(s.platform, s.deviceId, match) } : null
}
export async function initializeControl(s: AdjustmentState, deps: AdjustmentDependencies) {
  const { selector, element_id } = s.input
  if ((!selector && !element_id) || (selector && element_id)) {
    return failAdjustment(s, 'ELEMENT_NOT_FOUND', 'exactly one of selector or element_id is required', false, null, undefined, null, 0, 'gesture')
  }
  if (!selector || element_id) return null
  const wait = await deps.wait({ selector, condition: 'clickable', timeout_ms: 5000, poll_interval_ms: 300, platform: s.platform, deviceId: s.deviceId })
  if (wait?.status === 'success' && wait?.element?.elementId) {
    s.input.element_id = wait.element.elementId; s.fallback = null; return null
  }
  return initializeFallback(s, deps, wait, selector)
}
async function initializeFallback(s: AdjustmentState, deps: AdjustmentDependencies, wait: ControlWait | undefined, selector: UiSelector) {
  const query = selector.text ?? selector.resource_id ?? selector.accessibility_id ?? ''
  if (!query) return failAdjustment(s, wait?.error?.code === 'ELEMENT_NOT_FOUND' ? 'ELEMENT_NOT_FOUND' : 'TIMEOUT',
    wait?.error?.message ?? 'adjustable control not found', wait?.error?.code === 'ELEMENT_NOT_FOUND', null, wait?.device, null, 0, 'gesture')
  const fallback = await deps.find({ query, exact: false, timeoutMs: 3000, platform: s.platform, deviceId: s.deviceId })
  if (!fallback.found || !fallback.element) return failAdjustment(s, 'ELEMENT_NOT_FOUND', wait?.error?.message ?? 'adjustable control not found', true, null, wait?.device, null, 0, 'gesture')
  s.fallback = fallback.element
  return null
}
export async function prepareIteration(s: AdjustmentState, deps: AdjustmentDependencies) {
  const resolved = s.cached ? { tree: null, device: s.device, match: s.cached, resolvedTarget: deps.target(s.platform, s.deviceId, s.cached) } : await resolveControl(s, deps)
  if (!resolved?.match || !resolved.resolvedTarget) return failAdjustment(s, 'STALE_REFERENCE', 'adjustable control could not be resolved', true)
  s.device = resolved.device; s.target = resolved.resolvedTarget; s.cached = resolved.match
  const element = resolved.match.el
  const actionable = _isAdjustableActionable(element, s.stored?.stable_id)
  if (!actionable.actionable) return failAdjustment(s, actionable.failureCode ?? 'ELEMENT_NOT_INTERACTABLE', actionable.reason ?? 'adjustable control is not actionable', true)
  const elements = Array.isArray(resolved.tree?.elements) ? resolved.tree.elements : s.cached ? [s.cached.el] : [element]
  const plan = planAdjustment(element, elements, s.input.targetValue, s.input.property, s.tolerance)
  s.observed = plan.actualState
  if (!s.trace.some(step => step.stage === 'resolve')) recordAdjustment(s, 'resolve', 'success', { resolved_target: s.target, current_value: plan.currentValue, adjustment_mode: s.mode })
  const iteration: Iteration = { ...plan, element, index: resolved.match.idx, actionDevice: s.device, observed: plan.actualState,
    verification: { verification: null, observedState: plan.actualState, withinTolerance: false } }
  const invalid = validateControl(s, iteration)
  if (invalid) return invalid
  if (plan.currentValue !== null && Math.abs(plan.currentValue - plan.normalizedTargetValue) <= plan.effectiveTolerance) {
    recordAdjustment(s, 'verify', 'success', { property: s.input.property, target_value: plan.normalizedTargetValue, actual_state: plan.actualState, reason: 'control already within tolerance' })
    return succeedAdjustment(s, iteration, deps, 'control already within tolerance', 'semantic', s.device)
  }
  if (!plan.bounds) return failAdjustment(s, 'ELEMENT_NOT_INTERACTABLE', 'adjustable control has no bounds')
  return iteration
}
function validateControl(s: AdjustmentState, p: Iteration) {
  if (s.input.property !== 'value' && s.input.property !== 'raw_value') return failAdjustment(s, 'ELEMENT_NOT_INTERACTABLE', 'adjust_control currently supports numeric value and raw_value properties only')
  if (!_isAdjustableControl(p.element) && !p.inferredSliderState) return failAdjustment(s, 'ELEMENT_NOT_INTERACTABLE', 'target is not an adjustable control')
  if (p.currentValue === null) return failAdjustment(s, 'UNKNOWN', 'current numeric value is unavailable')
  if (p.valueRange && (s.input.targetValue < p.valueRange.min || s.input.targetValue > p.valueRange.max)) return failAdjustment(s, 'CONTROL_CONVERGENCE_FAILED', `targetValue ${s.input.targetValue} is outside the control range ${p.valueRange.min}..${p.valueRange.max}`)
  return null
}
