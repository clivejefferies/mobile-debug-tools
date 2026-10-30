import { _controlAxis, _buildConservativeControlPoint, _buildControlPoint, _buildAdjustmentProbePoints } from './control-geometry.js'
import { recordAdjustment, succeedAdjustment, failAdjustment, type AdjustmentState, type AdjustmentDependencies, type Iteration, type StrategyOutcome } from './adjustment-context.js'
import { verifyControl } from './adjustment-semantic.js'

function points(p: Iteration) {
  const bounds = p.bounds!, range = p.valueRange!, value = p.currentValue!
  const axis = _controlAxis(p.element, bounds)
  return { axis, target: _buildConservativeControlPoint(bounds, p.normalizedTargetValue, value, range.min, range.max, axis),
    current: _buildControlPoint(bounds, (value - range.min) / (range.max - range.min), axis) }
}
export async function coordinateAdjustment(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies): Promise<StrategyOutcome> {
  if (s.coordinatePending) return 'next'
  const geometry = points(p)
  const probes = p.inferredSliderState ? [geometry.target] : _buildAdjustmentProbePoints(p.bounds!, p.normalizedTargetValue, p.currentValue!, p.valueRange!.min, p.valueRange!.max, geometry.axis)
  for (let i = 0; i < probes.length && s.attempts < s.limit; i++) {
    const point = probes[i]
    s.mode = 'coordinate'
    recordAdjustment(s, 'execute', 'retry', { attempt: s.attempts + 1, mode: 'coordinate', point })
    const action = await deps.tap({ platform: s.platform, x: point.x, y: point.y, deviceId: s.deviceId })
    s.attempts++; p.actionDevice = action.device ?? p.actionDevice
    if (!action.success) {
      recordAdjustment(s, 'execute', 'retry', { attempt: s.attempts, mode: 'coordinate', point, success: false }); continue
    }
    await verifyControl(s, p, deps, 'control did not converge yet')
    if (p.verification.withinTolerance) return succeedAdjustment(s, p, deps, p.verification.verification?.reason ?? 'control converged to target value')
    s.coordinatePending = true; s.cached = null
    if (s.attempts < s.limit) return 'retry'
  }
  return 'next'
}
export async function gestureAdjustment(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies): Promise<StrategyOutcome> {
  if (s.attempts >= s.limit) return 'next'
  const geometry = points(p)
  s.coordinatePending = false; s.mode = 'gesture'
  recordAdjustment(s, 'execute', 'retry', { attempt: s.attempts + 1, mode: 'gesture', start: geometry.current, end: geometry.target })
  const action = await deps.swipe({ platform: s.platform, x1: geometry.current.x, y1: geometry.current.y,
    x2: geometry.target.x, y2: geometry.target.y, duration: p.inferredSliderState ? 520 : 220, deviceId: s.deviceId })
  s.attempts++
  if (!action.success) {
    recordAdjustment(s, 'execute', 'failure', { attempt: s.attempts, mode: 'gesture', start: geometry.current, end: geometry.target, success: false })
    return failAdjustment(s, 'UNKNOWN', action.error ?? 'adjustment gesture failed', false, s.target,
      action.device ?? p.actionDevice, p.observed ?? p.actualState)
  }
  p.actionDevice = action.device ?? p.actionDevice
  await verifyControl(s, p, deps, 'gesture adjustment did not converge yet')
  if (p.verification.withinTolerance) return succeedAdjustment(s, p, deps, p.verification.verification?.reason ?? 'control converged to target value')
  return 'next'
}
