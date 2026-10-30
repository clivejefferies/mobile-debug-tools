import type { UiElement, InferredLabeledSliderState } from '../model.js'
import { _normalize, _normalizeBounds } from '../targeting/element-helpers.js'
import { _textFromElement, _parseLeadingNumber } from './control-values.js'

export function _inferLabeledSliderState(elements: UiElement[], track: UiElement | null): InferredLabeledSliderState | null {
    const trackBounds = _normalizeBounds(track?.bounds)
    if (!track || !trackBounds) return null
    const type = _normalize(track.type ?? track.class ?? '')
    const role = _normalize(track.role ?? '')
    const width = trackBounds[2] - trackBounds[0]
    const height = trackBounds[3] - trackBounds[1]
    const wideTrackLike = width >= 240 && height <= 220
    const knownTrackLike = /slider|seekbar|range/.test(type) || /slider|range/.test(role)
    if (!wideTrackLike && !knownTrackLike) return null

    const trackTop = trackBounds[1]
    const trackBottom = trackBounds[3]
    const trackCenterX = (trackBounds[0] + trackBounds[2]) / 2
    const labels = elements
      .map((el, index) => {
        const bounds = _normalizeBounds(el.bounds)
        const text = _textFromElement(el)
        const value = _parseLeadingNumber(text)
        return bounds && text && value !== null
          ? {
            index,
            el,
            text,
            value,
            bounds,
            centerX: (bounds[0] + bounds[2]) / 2,
            centerY: (bounds[1] + bounds[3]) / 2,
            hasUnit: /[a-zA-Z%]/.test(text)
          }
          : null
      })
      .filter((label): label is NonNullable<typeof label> => !!label)

    const rangeLabels = labels
      .filter((label) => {
        const verticallyNearTrack = label.centerY >= trackTop - 520 && label.centerY <= trackBottom + 260
        const horizontallyNearTrack = label.centerX >= trackBounds[0] - 120 && label.centerX <= trackBounds[2] + 120
        return verticallyNearTrack && horizontallyNearTrack && label.hasUnit
      })
      .sort((a, b) => a.centerX - b.centerX)

    if (rangeLabels.length < 2) return null
    const minLabel = rangeLabels[0]
    const maxLabel = rangeLabels[rangeLabels.length - 1]
    if (!minLabel || !maxLabel || maxLabel.value <= minLabel.value) return null

    const currentCandidates = labels
      .filter((label) => {
        if (label.index === minLabel.index || label.index === maxLabel.index) return false
        if (label.value < minLabel.value || label.value > maxLabel.value) return false
        if (label.centerY < trackTop - 950 || label.centerY > minLabel.centerY - 20) return false
        return label.centerX >= trackCenterX - 80
      })
      .sort((a, b) => {
        const yDistance = Math.abs((trackTop - 420) - a.centerY) - Math.abs((trackTop - 420) - b.centerY)
        if (yDistance !== 0) return yDistance
        return b.centerX - a.centerX
      })

    const currentLabel = currentCandidates[0]
    if (!currentLabel) return null

    const candidateBelowRangeLabels = minLabel.centerY < trackTop && maxLabel.centerY < trackTop
    const labelDerivedBounds: [number, number, number, number] = [
      Math.min(minLabel.bounds[0], trackBounds[0]),
      Math.max(currentLabel.bounds[3] + 12, Math.min(minLabel.bounds[1], maxLabel.bounds[1]) - 160),
      Math.max(maxLabel.bounds[2], trackBounds[2]),
      Math.max(currentLabel.bounds[3] + 80, Math.min(minLabel.bounds[1], maxLabel.bounds[1]) - 32)
    ]

    return {
      current: currentLabel.value,
      min: minLabel.value,
      max: maxLabel.value,
      value_range: { min: minLabel.value, max: maxLabel.value },
      touch_bounds: candidateBelowRangeLabels ? labelDerivedBounds : trackBounds,
      source: 'nearby_labels'
    }
  }
