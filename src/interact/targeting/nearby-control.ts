import type { UiElement, UiResolution } from '../model.js'
import { _normalize, _normalizeBounds } from './element-helpers.js'

type Match = { el: UiElement; idx: number; sliderLike?: boolean }
function trackLimits(label: [number, number, number, number], screen?: UiResolution | null) {
  const width = Number(screen?.width) > 0 ? Number(screen?.width) : 0
  const height = Number(screen?.height) > 0 ? Number(screen?.height) : 0
  return { length: Math.max(220, width > 0 ? Math.floor(width * .18) : 0, height > 0 ? Math.floor(height * .18) : 0),
    thickness: Math.max(180, width > 0 ? Math.floor(width * .08) : 0, height > 0 ? Math.floor(height * .08) : 0),
    labelWidth: label[2] - label[0], labelHeight: label[3] - label[1] }
}
function nearbyScore(el: UiElement, label: [number, number, number, number], limits: ReturnType<typeof trackLimits>) {
  if (!el || !(el.clickable || el.focusable) || el.visible === false) return null
  const b = _normalizeBounds(el.bounds)
  if (!b) return null
  const width = b[2] - b[0], height = b[3] - b[1], gap = b[1] - label[3]
  if (gap < -32 || gap > 640 || Math.min(label[2], b[2]) - Math.max(label[0], b[0]) < -32) return null
  const horizontal = width >= Math.max(limits.length, Math.floor(limits.labelWidth * 1.5)) && height <= limits.thickness
  const vertical = height >= Math.max(limits.length, Math.floor(limits.labelHeight * 1.5)) && width <= limits.thickness
  const sliderLike = /slider|seek|range/i.test(_normalize(el.type ?? el.class ?? '')) || horizontal || vertical
  return { score: appearanceScore(gap, el, width, limits.labelWidth, sliderLike), sliderLike }
}
function appearanceScore(gap: number, el: UiElement, width: number, labelWidth: number, sliderLike: boolean) {
  const text = _normalize(el.text ?? el.label ?? el.value ?? '')
  const content = _normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? '')
  const type = _normalize(el.type ?? el.class ?? '')
  let score = gap
  if (!text && !content) score -= 18
  if (sliderLike) score -= 30
  if (/view|layout|group|frame/i.test(type)) score -= 10
  if (width > labelWidth * 1.5) score -= 8
  if (text || content) score += 20
  return score
}
export function nearbyControl(elements: UiElement[], chosen: Match | null, screen?: UiResolution | null): Match | null {
  if (!chosen) return null
  const label = _normalizeBounds(chosen.el.bounds)
  if (!label) return null
  const limits = trackLimits(label, screen)
  let best: Match | null = null, score = Infinity
  for (let i = chosen.idx + 1; i < Math.min(elements.length, chosen.idx + 8); i++) {
    const candidate = nearbyScore(elements[i], label, limits)
    if (candidate && candidate.score < score) { score = candidate.score; best = { el: elements[i], idx: i, sliderLike: candidate.sliderLike } }
  }
  return best
}
