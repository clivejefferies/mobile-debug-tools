import type { FindElementResponse, FindElementElement } from '../types.js'
import type { RankedResolutionCandidate } from './model.js'
import { _summarizeResolutionCandidate } from './element-helpers.js'

export function candidateResult(best: RankedResolutionCandidate, candidates: RankedResolutionCandidate[]): FindElementResponse {
  const b = best.el.bounds
  const bounds = Array.isArray(b) ? { left: b[0], top: b[1], right: b[2], bottom: b[3] } : null
  const unique = candidates.filter((candidate, index, array) => index === array.findIndex(other => other.idx === candidate.idx && other.el === candidate.el))
  const alternates = unique.filter(candidate => candidate.idx !== best.idx || candidate.el !== best.el).slice(0, 3).map(_summarizeResolutionCandidate)
  const element: FindElementElement = {
    text: best.el.text ?? null, resourceId: best.el.resourceId ?? null,
    contentDesc: best.el.contentDescription ?? best.el.contentDesc ?? null, class: best.el.type ?? best.el.class ?? null,
    bounds, clickable: !!best.el.clickable, enabled: !!best.el.enabled,
    stable_id: best.el.stable_id ?? null, role: best.el.role ?? null, test_tag: best.el.test_tag ?? null,
    selector: best.el.selector ?? null, semantic: best.el.semantic ?? null,
    tapCoordinates: bounds ? { x: Math.floor((bounds.left + bounds.right) / 2), y: Math.floor((bounds.top + bounds.bottom) / 2) } : null,
    telemetry: { matchedIndex: best.idx ?? null, matchedInteractable: !!best.interactable, sliderLike: best.reason === 'slider_track_preferred' }
  }
  if (best.reason === 'slider_track_preferred') element.interactionHint = { kind: 'slider',
    axis: bounds && (bounds.bottom - bounds.top) > (bounds.right - bounds.left) ? 'vertical' : 'horizontal', trackBounds: bounds }
  const score = Math.min(1, Number(best.score.toFixed(3)))
  return { found: true, element, score, confidence: score, resolution: {
    confidence: score, reason: best.reason, fallback_available: alternates.length > 0, matched_count: unique.length, alternates } }
}
