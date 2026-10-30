import { _hasDirectAdjustmentAction, _adjustmentDirections } from './control-values.js'
import { verifyAdjustment } from './adjustment-verification.js'
import { recordAdjustment, succeedAdjustment, type AdjustmentState, type AdjustmentDependencies, type Iteration, type StrategyOutcome } from './adjustment-context.js'

export async function verifyControl(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies, fallback: string) {
  p.verification = await verifyAdjustment({ labeled: !!p.inferredSliderState, currentEl: p.element, actualState: p.actualState,
    property: s.input.property, target: p.normalizedTargetValue, tolerance: p.effectiveTolerance,
    expectation: { element_id: s.target?.elementId ?? s.input.element_id, selector: s.input.selector ?? undefined,
      property: s.input.property, expected: p.normalizedTargetValue, platform: s.platform, deviceId: s.deviceId }
  }, { observe: () => deps.observe(s.platform, s.deviceId), expectState: deps.expectState })
  p.observed = p.verification.observedState; s.observed = p.observed
  recordAdjustment(s, 'verify', p.verification.withinTolerance ? 'success' : 'retry', {
    attempt: s.attempts, property: s.input.property, target_value: p.normalizedTargetValue,
    actual_state: p.observed, reason: p.verification.verification?.reason ?? fallback })
}
export async function directAdjustment(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies): Promise<StrategyOutcome> {
  if (!_hasDirectAdjustmentAction(p.element) || s.attempts >= s.limit) return 'next'
  const { interact, resolved } = await deps.service(s.platform, s.deviceId)
  if (typeof interact.setAdjustableValue !== 'function') return 'next'
  s.mode = 'semantic'
  recordAdjustment(s, 'execute', 'retry', { attempt: s.attempts + 1, mode: 'semantic', strategy: 'direct_set_value', target_value: p.normalizedTargetValue })
  const action = await interact.setAdjustableValue({ deviceId: resolved.id, target: s.target, property: s.input.property, value: p.normalizedTargetValue })
  s.attempts++; p.actionDevice = action?.device ?? p.actionDevice
  if (action?.success === false) return 'next'
  await verifyControl(s, p, deps, 'direct adjustment did not converge yet')
  if (p.verification.withinTolerance) return succeedAdjustment(s, p, deps, p.verification.verification?.reason ?? 'control converged to target value')
  s.cached = null
  return s.attempts < s.limit ? 'retry' : 'next'
}
export async function incrementalAdjustment(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies): Promise<StrategyOutcome> {
  const directions = _adjustmentDirections(p.element)
  if ((!directions.increment && !directions.decrement) || s.attempts >= s.limit) return 'next'
  const { interact, resolved } = await deps.service(s.platform, s.deviceId)
  const adjust = typeof interact.adjustAccessibleValue === 'function' ? interact.adjustAccessibleValue.bind(interact) : null
  while (adjust && s.attempts < s.limit) {
    const direction = p.normalizedTargetValue > (p.observed?.value ?? p.currentValue!) ? 'increment' : 'decrement'
    if (!directionAllowed(direction, directions)) break
    s.mode = 'semantic'
    recordAdjustment(s, 'execute', 'retry', { attempt: s.attempts + 1, mode: 'semantic', strategy: 'accessibility_increment_decrement', direction })
    const action = await adjust({ deviceId: resolved.id, target: s.target, property: s.input.property, direction })
    s.attempts++; p.actionDevice = action?.device ?? p.actionDevice
    if (action?.success === false) break
    await verifyControl(s, p, deps, 'incremental adjustment did not converge yet')
    if (p.verification.withinTolerance) return succeedAdjustment(s, p, deps, p.verification.verification?.reason ?? 'control converged to target value')
    s.cached = null
    if (s.attempts < s.limit) return 'retry'
  }
  return 'next'
}

function directionAllowed(direction: 'increment' | 'decrement', directions: { increment: boolean; decrement: boolean }) {
  return !((direction === 'increment' && !directions.increment) || (direction === 'decrement' && !directions.decrement))
}
