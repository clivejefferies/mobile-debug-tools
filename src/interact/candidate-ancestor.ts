import type { UiElement, RankedResolutionCandidate, UiResolution } from './model.js'
import { _isSemanticActionable } from './element-helpers.js'
import { nearbyControl } from './nearby-control.js'

type Match = { el: UiElement; idx: number }
function parentOf(elements: UiElement[], parent: number | string) {
  const index = typeof parent === 'number' ? parent : /^\d+$/.test(parent) ? Number(parent) : null
  if (index !== null && elements[index]) return { el: elements[index], idx: index }
  if (typeof parent !== 'string') return null
  const found = elements.findIndex(el => el.resourceId === parent || el.id === parent)
  return found >= 0 && elements[found] ? { el: elements[found], idx: found } : null
}
function ancestor(elements: UiElement[], chosen: Match): Match | null {
  if (!Array.isArray(chosen.el.bounds) || chosen.el.parentId == null) return null
  let current = chosen, safety = 0
  while (safety < 20 && !(current.el.clickable || current.el.focusable) && current.el.parentId != null) {
    const parent = parentOf(elements, current.el.parentId)
    if (!parent) break
    current = parent
    if (current.el.clickable || current.el.enabled || current.el.focusable) return current
    safety++
  }
  return null
}
function containing(elements: UiElement[], chosen: Match): Match | null {
  const child = chosen.el.bounds
  if (!Array.isArray(child)) return null
  let best: Match | null = null, area = Infinity
  for (let idx = 0; idx < elements.length; idx++) {
    const el = elements[idx]
    if (!el || !(el.clickable || el.focusable) || !Array.isArray(el.bounds) || el.bounds.length < 4) continue
    const [l, t, r, b] = el.bounds
    if (l <= child[0] && t <= child[1] && r >= child[2] && b >= child[3]) {
      const size = (r - l) * (b - t)
      if (size < area) { area = size; best = { el, idx } }
    }
  }
  return best
}
export function preferActionable(best: RankedResolutionCandidate, elements: UiElement[], screen: UiResolution | null) {
  const parent = ancestor(elements, best) ?? containing(elements, best)
  if (parent) best = { ...parent, score: Math.min(1, best.score + .02), reason: 'clickable_parent_preferred', interactable: true }
  if (!(best.el.clickable || best.el.focusable || _isSemanticActionable(best.el))) {
    const nearby = nearbyControl(elements, best, screen)
    if (nearby) best = { el: nearby.el, idx: nearby.idx, score: Math.min(1, best.score + .02),
      reason: nearby.sliderLike ? 'slider_track_preferred' : 'nearby_actionable_control', interactable: true }
  }
  return best
}
