import type { UiElement, RankedResolutionCandidate } from './model.js'
import { _normalize, _isSemanticActionable } from './element-helpers.js'

type Score = { score: number; reason: string }
function textScore(el: UiElement, query: string, exact: boolean): Score {
  const text = _normalize(el.text ?? el.label ?? el.value ?? '')
  const content = _normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? '')
  const resource = _normalize(el.resourceId ?? el.resourceID ?? el.id ?? '')
  const type = _normalize(el.type ?? el.class ?? '')
  const choices: Array<[string, boolean, number, string]> = [
    [text, text === query, 1, 'exact_text_match'], [content, content === query, .95, 'exact_content_desc_match'],
    [resource, resource === query, .92, 'exact_resource_id_match']
  ]
  if (!exact) choices.push([text, text.includes(query), .6, 'partial_text_match'], [content, content.includes(query), .55, 'partial_content_desc_match'],
    [resource, resource.includes(query), .7, 'partial_resource_id_match'])
  choices.push([type, exact ? type === query : type.includes(query), .3, exact ? 'exact_class_match' : 'partial_class_match'])
  for (const [value, matched, score, reason] of choices) if (value && matched) return { score, reason }
  return { score: 0, reason: 'best_scoring_candidate' }
}
function semanticScore(el: UiElement, query: string, exact: boolean, initial: Score): Score {
  const role = _normalize(el.semantic?.semantic_role ?? '')
  const actions = Array.isArray(el.semantic?.supported_actions) ? el.semantic.supported_actions.map(_normalize).filter(Boolean) : []
  const result = { ...initial }
  if (!result.score && role && (exact ? role === query : role.includes(query))) { result.score = .5; result.reason = 'semantic_role_match' }
  if (actions.some(action => exact ? action === query : action.includes(query))) {
    result.score = Math.max(result.score, result.score > 0 ? .65 : .6); result.reason = 'semantic_action_match'
  }
  if (!exact && result.score === 0 && el.semantic?.adjustable && /slider|stepper|dropdown|segment|control|adjust/.test(query)) {
    result.score = .45; result.reason = 'semantic_control_match'
  }
  return result
}
export function scoreCandidate(el: UiElement | null, idx: number, query: string, exact: boolean): RankedResolutionCandidate | null {
  if (!el || !el.visible) return null
  const bounds = el.bounds || [0, 0, 0, 0]
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) return null
  const interactable = !!(el.clickable || el.enabled || el.focusable || _isSemanticActionable(el))
  const result = semanticScore(el, query, exact, textScore(el, query, exact))
  if (result.score > 0 && interactable) result.score += .05
  return result.score > 0 ? { el, idx, ...result, interactable } : null
}
