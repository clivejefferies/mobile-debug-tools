import type { UiSelector } from '../contracts/selector.js'
import type { UiElement } from './model.js'
import { _normalize, _isVisibleElement, _resolveActionableAncestor } from './element-helpers.js'

export type UICondition = 'exists' | 'not_exists' | 'visible' | 'clickable'
export type ElementMatch = { el: UiElement; idx: number }
function matchesField(value: unknown, query: string | null | undefined, contains: boolean) {
  if (query === undefined || query === null) return true
  return contains ? _normalize(value).includes(_normalize(query)) : _normalize(value) === _normalize(query)
}
export function matchingElements(elements: UiElement[], selector: UiSelector): ElementMatch[] {
  const matches: ElementMatch[] = []
  const contains = !!selector.contains
  for (let idx = 0; idx < elements.length; idx++) {
    const el = elements[idx]
    if (!matchesField(el.text || el.label || el.value || '', selector.text, contains)) continue
    if (!matchesField(el.resourceId || el.resourceID || el.id || '', selector.resource_id, contains)) continue
    if (!matchesField(el.contentDescription || el.contentDesc || el.accessibilityLabel || el.label || '', selector.accessibility_id, contains)) continue
    matches.push({ el, idx })
  }
  return matches
}
function selectedMatch(matches: ElementMatch[], index?: number) {
  if (!matches.length) return null
  return index === undefined ? matches[0] : index >= 0 && index < matches.length ? matches[index] : null
}
function clickTarget(elements: UiElement[], chosen: ElementMatch | null, tap: boolean) {
  if (!chosen) return null
  if (tap && (!_isVisibleElement(chosen.el) || chosen.el.enabled === false)) return chosen
  return _resolveActionableAncestor(elements, chosen) || chosen
}
export function evaluateCondition(elements: UiElement[], matches: ElementMatch[], condition: UICondition, index?: number, tap = false) {
  const chosen = selectedMatch(matches, index)
  let element = chosen
  let met = false
  if (condition === 'exists') met = index !== undefined ? chosen !== null : matches.length >= 1
  else if (condition === 'not_exists') met = index !== undefined ? chosen === null : matches.length === 0
  else if (condition === 'visible') met = !!chosen && waitVisible(chosen.el)
  else if (condition === 'clickable') {
    element = clickTarget(elements, chosen, tap)
    met = !!element && waitVisible(element.el) && !!element.el.enabled && !!(element.el.clickable || element.el._interactable || element.el.focusable)
  }
  if (tap && met && element && _isVisibleElement(element.el) && element.el.enabled !== false) {
    element = _resolveActionableAncestor(elements, element) ?? element
  }
  return { met, element }
}

function waitVisible(el: UiElement) {
  const b = el.bounds
  return !!el.visible && Array.isArray(b) && b.length >= 4 && b[2] > b[0] && b[3] > b[1]
}
