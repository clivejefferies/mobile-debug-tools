import type { AdjustControlResponse, ExpectStateResponse } from '../types.js'
import type { UiElement } from './model.js'
import type { UiSelector } from '../contracts/selector.js'
import { _inferLabeledSliderState } from './slider-labels.js'
import { _parseNumericControlValue } from './control-values.js'

interface StateExpectation {
  element_id?: string
  selector?: UiSelector
  property: string
  expected: number
  platform: 'android' | 'ios'
  deviceId?: string
}
export interface AdjustmentVerificationInput {
  labeled: boolean
  currentEl: UiElement
  actualState: AdjustControlResponse['actual_state']
  property: string
  target: number
  tolerance: number
  expectation: StateExpectation
}
export interface AdjustmentVerificationDependencies {
  observe(): Promise<{ elements?: UiElement[] } | null>
  expectState(input: StateExpectation): Promise<ExpectStateResponse>
}

/** Every verification obtains fresh evidence through its supplied observation boundary. */
export async function verifyAdjustment(input: AdjustmentVerificationInput, dependencies: AdjustmentVerificationDependencies) {
  if (input.labeled) return verifyLabeledControl(input, dependencies)
  const verification = await dependencies.expectState(input.expectation)
  const observedValue = _parseNumericControlValue(verification?.observed_state?.value) ??
    _parseNumericControlValue(verification?.observed_state?.raw_value)
  const observedState = observedValue !== null ? {
    property: input.property, value: observedValue,
    raw_value: typeof verification?.observed_state?.raw_value === 'number' ? verification.observed_state.raw_value : undefined
  } : input.actualState
  return { verification, observedState, withinTolerance: withinTolerance(observedValue, input) }
}
async function verifyLabeledControl(input: AdjustmentVerificationInput, dependencies: AdjustmentVerificationDependencies) {
  const tree = await dependencies.observe()
  const elements = Array.isArray(tree?.elements) ? tree.elements : []
  const refreshed = _inferLabeledSliderState(elements, input.currentEl)
  const observedValue = refreshed?.current ?? null
  const observedState = observedValue !== null ? {
    property: input.property, value: observedValue, raw_value: observedValue
  } : input.actualState
  const matched = withinTolerance(observedValue, input)
  return {
    verification: {
      success: matched, observed_state: observedState,
      reason: observedValue !== null ? 'visible labeled value read from nearby slider labels' : 'visible labeled value unavailable'
    },
    observedState, withinTolerance: matched
  }
}
function withinTolerance(value: number | null, input: AdjustmentVerificationInput) {
  return value !== null && Math.abs(value - input.target) <= input.tolerance
}
