import type { UiElement } from './model.js'
import { _normalize } from './element-helpers.js'

export function _buildControlPoint(bounds: [number, number, number, number], ratio: number, axis: 'horizontal' | 'vertical') {
    const clampedRatio = Math.max(0, Math.min(1, ratio))
    const [left, top, right, bottom] = bounds
    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)
    const insetX = Math.max(8, Math.floor(width * 0.08))
    const insetY = Math.max(8, Math.floor(height * 0.08))
    if (axis === 'vertical') {
      const usableHeight = Math.max(1, height - (insetY * 2))
      return {
        x: Math.floor((left + right) / 2),
        y: Math.floor(bottom - insetY - (usableHeight * clampedRatio))
      }
    }
    const usableWidth = Math.max(1, width - (insetX * 2))
    return {
      x: Math.floor(left + insetX + (usableWidth * clampedRatio)),
      y: Math.floor((top + bottom) / 2)
    }
  }

export function _buildConservativeControlPoint(
    bounds: [number, number, number, number],
    targetValue: number,
    currentValue: number | null,
    min: number,
    max: number,
    axis: 'horizontal' | 'vertical'
  ) {
    const range = Math.max(1, max - min)
    const targetRatio = (targetValue - min) / range
    const stepRatio = 1 / range
    const centerBias = stepRatio / 2
    const direction = currentValue === null ? 0 : Math.sign(targetValue - currentValue)
    const controlLengthPx = axis === 'vertical' ? Math.max(1, bounds[3] - bounds[1]) : Math.max(1, bounds[2] - bounds[0])
    const edgeWindow = Math.max(3, Math.floor(range * 0.1))
    const isNearLowEdge = targetValue - min <= edgeWindow
    const isNearHighEdge = max - targetValue <= edgeWindow
    const directionBias = direction > 0
      ? -stepRatio * 0.15
      : direction < 0
        ? stepRatio * 0.65
        : 0
    const pixelBasedMargin = Math.min(0.03, Math.max(0.005, 2 / controlLengthPx))
    const endpointMargin = Math.max(stepRatio * 0.5, pixelBasedMargin)
    const edgeBias = isNearLowEdge
      ? endpointMargin
      : isNearHighEdge
        ? Math.max(stepRatio * 0.4, endpointMargin * 0.75)
        : 0
    const safeRatio = Math.min(
      1 - (endpointMargin * 0.25),
      Math.max(endpointMargin, targetRatio + centerBias + directionBias + edgeBias)
    )
    return _buildControlPoint(bounds, safeRatio, axis)
  }

export function _buildAdjustmentProbePoints(
    bounds: [number, number, number, number],
    targetValue: number,
    currentValue: number | null,
    min: number,
    max: number,
    axis: 'horizontal' | 'vertical'
  ) {
    const targetPoint = _buildConservativeControlPoint(bounds, targetValue, currentValue, min, max, axis)
    const currentPoint = currentValue !== null
      ? _buildControlPoint(bounds, (currentValue - min) / (max - min), axis)
      : _buildControlPoint(bounds, 0.5, axis)

    const [left, top, right, bottom] = bounds
    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)
    const crossAxisBumps = axis === 'horizontal'
      ? [Math.max(24, Math.floor(height * 0.75)), Math.max(40, Math.floor(height * 1.5))]
      : [Math.max(24, Math.floor(width * 0.75)), Math.max(40, Math.floor(width * 1.5))]

    const clampPoint = (point: { x: number, y: number }) => ({
      x: axis === 'horizontal'
        ? Math.max(left, Math.min(right, point.x))
        : Math.max(left, Math.min(right + Math.max(width, height), point.x)),
      y: axis === 'vertical'
        ? Math.max(top, Math.min(bottom, point.y))
        : Math.max(top, Math.min(bottom + Math.max(height, width), point.y))
    })

    const probes = [targetPoint, currentPoint]
    for (const bump of crossAxisBumps) {
      if (axis === 'horizontal') {
        probes.push(
          { x: targetPoint.x, y: bottom + bump },
          { x: currentPoint.x, y: bottom + bump }
        )
      } else {
        probes.push(
          { x: right + bump, y: targetPoint.y },
          { x: right + bump, y: currentPoint.y }
        )
      }
    }

    return Array.from(
      new Map(
        probes
          .map(clampPoint)
          .map((point) => [`${point.x}:${point.y}`, point] as const)
      ).values()
    )
  }

export function _controlAxis(el: UiElement, bounds: [number, number, number, number]): 'horizontal' | 'vertical' {
    const type = _normalize(el.type ?? el.class ?? '')
    const role = _normalize(el.role ?? '')
    if (/vertical/.test(type) || /vertical/.test(role)) return 'vertical'
    if (/horizontal/.test(type) || /horizontal/.test(role)) return 'horizontal'
    return (bounds[3] - bounds[1]) > (bounds[2] - bounds[0]) ? 'vertical' : 'horizontal'
  }
