import type { AdjustControlResponse } from '../../types.js'
import { createAdjustment, failAdjustment, recordAdjustment, succeedAdjustment,
  type AdjustmentInput, type AdjustmentDependencies, type AdjustmentState, type Iteration } from './adjustment-context.js'
import { initializeControl, prepareIteration } from './adjustment-resolution.js'
import { directAdjustment, incrementalAdjustment } from './adjustment-semantic.js'
import { coordinateAdjustment, gestureAdjustment } from './adjustment-gestures.js'

function cacheObservation(s: AdjustmentState, p: Iteration) {
  s.cached = p.inferredSliderState ? null : {
    el: { ...p.element, state: { ...(p.element.state ?? null), ...(p.observed ? {
      [p.observed.property]: p.observed.value, raw_value: p.observed.raw_value ?? p.observed.value
    } : {}) } }, idx: p.index
  }
}
async function attempt(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies) {
  for (const strategy of [directAdjustment, incrementalAdjustment]) {
    const outcome = await strategy(s, p, deps)
    if (outcome !== 'next') return outcome
  }
  if (!p.bounds) return failAdjustment(s, 'ELEMENT_NOT_INTERACTABLE', 'adjustable control has no bounds')
  if (!p.valueRange) return failAdjustment(s, 'UNKNOWN', 'value_range unavailable')
  for (const strategy of [coordinateAdjustment, gestureAdjustment]) {
    const outcome = await strategy(s, p, deps)
    if (outcome !== 'next') return outcome
  }
  s.observed = p.observed
  if (p.verification.withinTolerance) {
    const reason = p.verification.verification?.reason ?? 'control converged to target value'
    recordAdjustment(s, 'verify', 'success', { attempt: s.attempts, property: s.input.property,
      target_value: p.normalizedTargetValue, actual_state: p.observed, reason })
    return succeedAdjustment(s, p, deps, reason)
  }
  cacheObservation(s, p)
  return 'next'
}
export async function adjustControl(input: AdjustmentInput, deps: AdjustmentDependencies): Promise<AdjustControlResponse> {
  const state = await createAdjustment(input, deps)
  const invalid = await initializeControl(state, deps)
  if (invalid) return invalid
  for (let index = 0; index < state.limit && state.attempts < state.limit; index++) {
    const prepared = await prepareIteration(state, deps)
    if ('success' in prepared) return prepared
    const outcome = await attempt(state, prepared, deps)
    if (outcome !== 'retry' && outcome !== 'next') return outcome
  }
  const after = await deps.fingerprint(state.platform, state.deviceId)
  return failAdjustment(state, 'CONTROL_CONVERGENCE_FAILED', 'control did not converge within the allotted attempts', true,
    state.target, state.device, state.observed, state.attempts, state.mode, after)
}
