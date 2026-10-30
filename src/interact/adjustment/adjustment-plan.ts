import type { UiElement } from '../model.js'
import type { AdjustControlResponse } from '../../types.js'
import { _normalizeBounds } from '../targeting/element-helpers.js'
import { _inferLabeledSliderState } from './slider-labels.js'
import { _readNumericControlRange, _readControlStep, _quantizeTargetValue,
  _defaultAdjustTolerance, _readNumericControlValue } from './control-values.js'

export function planAdjustment(currentEl: UiElement, elements: UiElement[], targetValue: number,
  property: string, requestedTolerance: number | null) {
  const inferredSliderState = _inferLabeledSliderState(elements, currentEl)
  const nativeBounds = _normalizeBounds(currentEl.bounds)
  const bounds = inferredSliderState?.touch_bounds ?? nativeBounds
  const valueRange = _readNumericControlRange(currentEl) ?? inferredSliderState?.value_range ?? null
  const step = _readControlStep(currentEl)
  const normalizedTargetValue = valueRange ? _quantizeTargetValue(targetValue, valueRange.min, valueRange.max, step) : targetValue
  const effectiveTolerance = requestedTolerance ?? _defaultAdjustTolerance(valueRange, step)
  const currentValue = _readNumericControlValue(currentEl, property) ?? inferredSliderState?.current ?? null
  const actualState: AdjustControlResponse['actual_state'] = currentValue !== null ? {
    property, value: currentValue,
    raw_value: typeof currentEl.state?.raw_value === 'number' ? currentEl.state.raw_value : inferredSliderState?.current
  } : null
  return { inferredSliderState, bounds, valueRange, normalizedTargetValue, effectiveTolerance, currentValue, actualState }
}
