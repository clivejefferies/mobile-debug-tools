import type { FindElementResolutionSummary } from './model.js'
import type { ActionFailureCode, ActionTargetResolved } from '../types.js'
import type { UiElement, RankedResolutionCandidate } from './model.js'
import { createHash } from 'node:crypto'

export function _normalize(s: unknown): string {
    if (s === null || s === undefined) return ''
    try { return String(s).toLowerCase().trim() } catch { return '' }
  }

export function _normalizeBounds(bounds: unknown): [number, number, number, number] | null {
    if (!Array.isArray(bounds) || bounds.length < 4) return null
    const normalized = bounds.slice(0, 4).map((value: unknown) => Number(value))
    if (normalized.some((value: number) => Number.isNaN(value))) return null
    return normalized as [number, number, number, number]
  }

export function _hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
  }

function matchesField(value: string, query: string | null | undefined, contains: boolean) {
  if (query === undefined || query === null) return true
  const normalized = _normalize(query)
  return contains ? value.includes(normalized) : value === normalized
}
export function _matchesSelector(el: UiElement, selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }): boolean {
  if (!selector) return false
  const contains = !!selector.contains
  return matchesField(_normalize(el.text ?? el.label ?? el.value ?? ''), selector.text, contains) &&
    matchesField(_normalize(el.resourceId ?? el.resourceID ?? el.id ?? ''), selector.resource_id, contains) &&
    matchesField(_normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? el.label ?? ''), selector.accessibility_id, contains)
}

export function _findFirstMatchingElement(
    elements: UiElement[],
    selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }
  ): { el: UiElement, idx: number } | null {
    if (!selector) return null
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!el) continue
      if (_matchesSelector(el, selector)) return { el, idx: i }
    }
    return null
  }

export function _resolveParentIndex(elements: UiElement[], parentId: number | string | null | undefined): number | null {
    if (parentId === undefined || parentId === null) return null

    if (typeof parentId === 'number' && Number.isInteger(parentId) && parentId >= 0 && parentId < elements.length) {
      return parentId
    }

    if (typeof parentId === 'string') {
      const normalized = _normalize(parentId)
      if (!normalized) return null

      if (/^\d+$/.test(normalized)) {
        const index = Number(normalized)
        if (index >= 0 && index < elements.length) return index
      }

      const foundIndex = elements.findIndex((el) => {
        if (!el) return false
        return _normalize(el.resourceId ?? el.resourceID ?? el.id ?? '') === normalized ||
          _normalize(el.stable_id ?? '') === normalized
      })

      return foundIndex >= 0 ? foundIndex : null
    }

    return null
  }

export function _isVisibleElement(el: UiElement): boolean {
    const bounds = _normalizeBounds(el.bounds)
    return !!el.visible && !!bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1]
  }

export function _isTapActionable(
    el: UiElement,
    storedStableId?: string | null,
    platform?: 'android' | 'ios'
  ): { actionable: boolean, failureCode?: ActionFailureCode, reason?: string } {
    if (!_isVisibleElement(el)) {
      return { actionable: false, failureCode: 'ELEMENT_NOT_INTERACTABLE', reason: 'element is not visible' }
    }

    if (el.enabled === false) {
      return { actionable: false, failureCode: 'ELEMENT_NOT_INTERACTABLE', reason: 'element is disabled' }
    }

    const semanticTapActionable = !!el.semantic && (
      el.semantic.is_clickable ||
      (Array.isArray(el.semantic.supported_actions) && el.semantic.supported_actions.some((action) => _normalize(action) === 'tap'))
    )

    if (!el.clickable && !(platform === 'ios' && semanticTapActionable)) {
      return { actionable: false, failureCode: 'ELEMENT_NOT_INTERACTABLE', reason: 'element is not clickable' }
    }

    if (storedStableId) {
      if (!el.stable_id || el.stable_id !== storedStableId) {
        return { actionable: false, failureCode: 'STALE_REFERENCE', reason: 'element stable_id changed' }
      }
    }

    return { actionable: true }
  }

export function _isAdjustableActionable(el: UiElement, storedStableId?: string | null): { actionable: boolean, failureCode?: ActionFailureCode, reason?: string } {
    if (!_isVisibleElement(el)) {
      return { actionable: false, failureCode: 'ELEMENT_NOT_INTERACTABLE', reason: 'element is not visible' }
    }

    if (el.enabled === false) {
      return { actionable: false, failureCode: 'ELEMENT_NOT_INTERACTABLE', reason: 'element is disabled' }
    }

    if (storedStableId) {
      if (!el.stable_id || el.stable_id !== storedStableId) {
        return { actionable: false, failureCode: 'STALE_REFERENCE', reason: 'element stable_id changed' }
      }
    }

    return { actionable: true }
  }

export function _computeElementId(platform: 'android' | 'ios', deviceId: string | undefined, el: UiElement, index: number): string {
    const identity = {
      platform,
      deviceId: deviceId || '',
      text: _normalize(el.text ?? el.label ?? el.value ?? ''),
      resourceId: _normalize(el.resourceId ?? el.resourceID ?? el.id ?? ''),
      accessibilityId: _normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? el.label ?? ''),
      class: _normalize(el.type ?? el.class ?? ''),
      bounds: _normalizeBounds(el.bounds) ?? [0, 0, 0, 0],
      index
    }
    return `el_${createHash('sha1').update(JSON.stringify(identity)).digest('hex').slice(0, 24)}`
  }

export function _resolvedTargetFromElement(
    elementId: string,
    element: UiElement,
    index: number
  ): ActionTargetResolved {
    return {
      elementId,
      text: element.text ?? null,
      resource_id: element.resourceId ?? element.resourceID ?? element.id ?? null,
      accessibility_id: element.contentDescription ?? element.contentDesc ?? element.accessibilityLabel ?? element.label ?? null,
      class: element.type ?? element.class ?? null,
      bounds: _normalizeBounds(element.bounds),
      index,
      state: element.state ?? null,
      stable_id: element.stable_id ?? null,
      role: element.role ?? null,
      test_tag: element.test_tag ?? null,
      selector: element.selector ?? null,
      semantic: element.semantic ?? null
    }
  }

export function _summarizeResolutionCandidate(candidate: RankedResolutionCandidate): FindElementResolutionSummary['alternates'][number] {
    const bounds = _normalizeBounds(candidate.el.bounds)
    return {
      text: candidate.el.text ?? null,
      resource_id: candidate.el.resourceId ?? candidate.el.resourceID ?? candidate.el.id ?? null,
      accessibility_id: candidate.el.contentDescription ?? candidate.el.contentDesc ?? candidate.el.accessibilityLabel ?? candidate.el.label ?? null,
      class: candidate.el.type ?? candidate.el.class ?? null,
      bounds: bounds
        ? { left: bounds[0], top: bounds[1], right: bounds[2], bottom: bounds[3] }
        : null,
      clickable: !!candidate.el.clickable,
      enabled: !!candidate.el.enabled,
      score: candidate.score,
      reason: candidate.reason
    }
  }

export function _isAdjustableControl(el: UiElement | null): boolean {
    if (!el) return false
    const type = _normalize(el.type ?? el.class ?? '')
    const role = _normalize(el.role ?? '')
    return !!el.state?.value_range || /slider|seekbar|stepper|adjustable|range/.test(type) || /slider|seekbar|stepper|adjustable|range/.test(role)
  }

export function _isSemanticActionable(el: UiElement | null): boolean {
    if (!el?.semantic) return false
    if (el.semantic.adjustable) return true
    return Array.isArray(el.semantic.supported_actions) && el.semantic.supported_actions.length > 0
  }

export function _resolveActionableAncestor(elements: UiElement[], chosen: { el: UiElement, idx: number } | null): { el: UiElement, idx: number } | null {
    if (!chosen) return null
    if (hasActionableTrait(chosen.el)) return chosen

    let current = chosen
    let safety = 0

    while (safety < 20 && !(hasActionableTrait(current.el)) && current.el.parentId !== undefined && current.el.parentId !== null) {
      const parentIndex = _resolveParentIndex(elements, current.el.parentId)

      if (parentIndex !== null && elements[parentIndex]) {
        current = { el: elements[parentIndex], idx: parentIndex }
        if (hasActionableTrait(current.el)) return current
      } else {
        break
      }

      safety++
    }

    const childBounds = _normalizeBounds(chosen.el.bounds)
    if (!childBounds) return null
    const [cl, ct, cr, cb] = childBounds

    let best: { el: UiElement, idx: number } | null = null
    let bestArea = Infinity

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!el || !(hasActionableTrait(el))) continue
      const bounds = _normalizeBounds(el.bounds)
      if (!bounds) continue
      const [pl, pt, pr, pb] = bounds
      if (pl <= cl && pt <= ct && pr >= cr && pb >= cb) {
        const area = (pr - pl) * (pb - pt)
        if (area < bestArea) {
          bestArea = area
          best = { el, idx: i }
        }
      }
    }

    return best
  }

function hasActionableTrait(el: UiElement): boolean {
  return !!(el.clickable || el.focusable || _isSemanticActionable(el))
}
