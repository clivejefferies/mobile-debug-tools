import type { UIElementState } from '../../types.js'
import type { UiElement } from '../model.js'
import { _normalize } from '../targeting/element-helpers.js'

export function _readNumericControlValue(el: UiElement | null, property: string): number | null {
    if (!el?.state) return null
    const stateValue = el.state[property as keyof UIElementState]
    if (typeof stateValue === 'number' && Number.isFinite(stateValue)) return stateValue
    const parsedStateValue = _parseNumericControlValue(stateValue)
    if (parsedStateValue !== null) return parsedStateValue
    if (property === 'value' || property === 'raw_value') {
      const fallback = el.state.raw_value ?? el.state.value
      if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback
      return _parseNumericControlValue(fallback)
    }
    return null
  }

export function _parseNumericControlValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null

    const percent = trimmed.match(/^([-+]?\d+(?:\.\d+)?)\s*%$/)
    if (percent) return Number(percent[1])

    const fraction = trimmed.match(/^([-+]?\d+(?:\.\d+)?)\s+of\s+[-+]?\d+(?:\.\d+)?$/i)
    if (fraction) return Number(fraction[1])

    const plain = Number(trimmed)
    if (Number.isFinite(plain)) return plain

    const trailing = trimmed.match(/,\s*([-+]?\d+(?:\.\d+)?)$/)
    if (trailing) return Number(trailing[1])

    return null
  }

export function _readNumericControlRange(el: UiElement | null): { min: number; max: number } | null {
    const range = el?.state?.value_range
    const min = typeof range?.min === 'number' ? range.min : null
    const max = typeof range?.max === 'number' ? range.max : null
    if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && max > min) {
      return { min, max }
    }

    return rangeFromFraction(el?.state?.value ?? el?.state?.raw_value)
  }

function rangeFromFraction(value: unknown): { min: number; max: number } | null {
    if (typeof value === 'string') {
      const fraction = value.trim().match(/^[-+]?\d+(?:\.\d+)?\s+of\s+([-+]?\d+(?:\.\d+)?)$/i)
      if (fraction) {
        const parsedMax = Number(fraction[1])
        if (Number.isFinite(parsedMax) && parsedMax > 0) return { min: 0, max: parsedMax }
      }
    }

    return null
  }

export function _readControlStep(el: UiElement | null): number | null {
    const candidates = [
      el?.state?.step,
      el?.state?.value_range?.step
    ]
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate
    }
    return null
  }

export function _quantizeTargetValue(targetValue: number, min: number, max: number, step: number | null): number {
    if (!step) return targetValue
    const quantized = min + (Math.round((targetValue - min) / step) * step)
    const bounded = Math.max(min, Math.min(max, quantized))
    const precision = _decimalPrecisionForStep(step)
    return Number(bounded.toFixed(precision))
  }

export function _decimalPrecisionForStep(step: number): number {
    const normalized = String(step).toLowerCase()
    const [coefficient, exponentPart] = normalized.split('e')
    const coefficientDecimals = coefficient.includes('.')
      ? coefficient.split('.')[1]?.length ?? 0
      : 0
    const exponent = exponentPart !== undefined ? Number(exponentPart) : 0
    const precision = exponent < 0
      ? coefficientDecimals + Math.abs(exponent)
      : Math.max(0, coefficientDecimals - exponent)
    return Math.max(0, Math.min(12, precision))
  }

export function _defaultAdjustTolerance(range: { min: number; max: number } | null, step: number | null): number {
    if (step) return 0
    if (!range) return 0
    return Math.max(0, 0.01 * Math.abs(range.max - range.min))
  }

export function _runtimeActionSet(el: UiElement | null): Set<string> {
    const values = [
      ...(Array.isArray(el?.actions) ? el!.actions! : []),
      ...(Array.isArray(el?.accessibilityActions) ? el!.accessibilityActions! : []),
      ...(Array.isArray(el?.runtimeActions) ? el!.runtimeActions! : []),
      ...(Array.isArray(el?.platformActions) ? el!.platformActions! : [])
    ]
    return new Set(values.map((value) => _normalize(value)).filter(Boolean))
  }

export function _hasDirectAdjustmentAction(el: UiElement | null): boolean {
    const actions = _runtimeActionSet(el)
    return [
      'action_set_progress',
      'set_progress',
      'setprogress',
      'semanticsactions.setprogress',
      'set_value',
      'setvalue',
      'direct_set_value'
    ].some((action) => actions.has(action))
  }

export function _adjustmentDirections(el: UiElement | null): { increment: boolean; decrement: boolean } {
    const actions = _runtimeActionSet(el)
    return {
      increment: ['increment', 'accessibility_increment', 'action_increment'].some((action) => actions.has(action)),
      decrement: ['decrement', 'accessibility_decrement', 'action_decrement'].some((action) => actions.has(action))
    }
  }

export function _textFromElement(el: UiElement | null): string {
    return String(el?.text ?? el?.contentDescription ?? el?.contentDesc ?? el?.accessibilityLabel ?? el?.value ?? '').trim()
  }

export function _parseLeadingNumber(text: string): number | null {
    const match = text.trim().match(/^([-+]?\d+(?:\.\d+)?)(?:\s*[a-zA-Z%]+)?$/)
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
  }
