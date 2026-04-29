import { createHash } from 'crypto'
import { AndroidInteract } from './android.js';
import { iOSInteract } from './ios.js';
export { AndroidInteract, iOSInteract };

import { resolveTargetDevice } from '../utils/resolve-device.js'
import { ToolsObserve } from '../observe/index.js'
import { computeSnapshotSignature } from '../observe/snapshot-metadata.js'
import { buildActionExecutionResult } from '../server/common.js'
import type {
  ActionFailureCode,
  ActionTargetResolved,
  AdjustControlResponse,
  FindElementResponse,
  ExpectElementVisibleResponse,
  ExpectStateResponse,
  ExpectScreenResponse,
  WaitForUIChangeResponse,
  UIElementSemanticMetadata,
  UIElementState,
  TapElementResponse
} from '../types.js'

interface ScreenFingerprintResponse { fingerprint: string | null }

interface UiElement {
  text?: string | null
  label?: string | null
  value?: string | null
  contentDescription?: string | null
  contentDesc?: string | null
  accessibilityLabel?: string | null
  resourceId?: string | null
  resourceID?: string | null
  id?: string | null
  type?: string | null
  class?: string | null
  bounds?: number[] | null
  clickable?: boolean
  enabled?: boolean
  focusable?: boolean
  visible?: boolean
  parentId?: number | string | null
  _index?: number
  _interactable?: boolean
  _sliderLike?: boolean
  state?: UIElementState | null
  stable_id?: string | null
  role?: string | null
  test_tag?: string | null
  selector?: { value: string | null, confidence: { score: number, reason: string } | null } | null
  semantic?: UIElementSemanticMetadata | null
}

interface ResolvedUiElementContext {
  elementId: string
  platform: 'android' | 'ios'
  deviceId?: string
  bounds: [number, number, number, number] | null
  index: number
}

interface UiResolution {
  width?: number
  height?: number
}

interface UiChangeSignatureSet {
  hierarchy: string | null
  text: string | null
  state: string | null
}

interface RankedResolutionCandidate {
  el: UiElement
  idx: number
  score: number
  reason: string
  interactable: boolean
}

interface FindElementResolutionSummary {
  confidence: number
  reason: string
  fallback_available: boolean
  matched_count: number
  alternates: Array<{
    text: string | null
    resource_id: string | null
    accessibility_id: string | null
    class: string | null
    bounds: { left: number; top: number; right: number; bottom: number } | null
    clickable: boolean
    enabled: boolean
    score: number
    reason: string
  }>
}


export class ToolsInteract {
  private static readonly _maxResolvedUiElements = 256
  private static readonly _uiChangeKinds: Array<'hierarchy_diff' | 'text_change' | 'state_change'> = ['hierarchy_diff', 'text_change', 'state_change']
  private static readonly _sliderSearchLookahead = 8
  private static readonly _sliderNegativeGapTolerancePx = 32
  private static readonly _sliderPositiveGapLimitPx = 640
  private static readonly _sliderTrackMinLengthPx = 220
  private static readonly _sliderTrackMaxThicknessPx = 180
  private static readonly _sliderTrackLengthRatio = 0.18
  private static readonly _sliderTrackThicknessRatio = 0.08
  private static readonly _sliderLabelWidthRatio = 1.5
  private static _resolvedUiElements = new Map<string, ResolvedUiElementContext>()

  private static _normalize(s: any): string {
    if (s === null || s === undefined) return ''
    try { return String(s).toLowerCase().trim() } catch { return '' }
  }

  private static _normalizeBounds(bounds: any): [number, number, number, number] | null {
    if (!Array.isArray(bounds) || bounds.length < 4) return null
    const normalized = bounds.slice(0, 4).map((value: any) => Number(value))
    if (normalized.some((value: number) => Number.isNaN(value))) return null
    return normalized as [number, number, number, number]
  }

  private static _hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
  }

  private static _matchesSelector(el: UiElement, selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }): boolean {
    if (!selector) return false
    const normalize = ToolsInteract._normalize
    const containsFlag = !!selector.contains
    const text = normalize(el.text ?? el.label ?? el.value ?? '')
    const resourceId = normalize(el.resourceId ?? el.resourceID ?? el.id ?? '')
    const accessibilityId = normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? el.label ?? '')

    if (selector.text !== undefined && selector.text !== null) {
      const q = normalize(selector.text)
      if (containsFlag ? !text.includes(q) : text !== q) return false
    }

    if (selector.resource_id !== undefined && selector.resource_id !== null) {
      const q = normalize(selector.resource_id)
      if (containsFlag ? !resourceId.includes(q) : resourceId !== q) return false
    }

    if (selector.accessibility_id !== undefined && selector.accessibility_id !== null) {
      const q = normalize(selector.accessibility_id)
      if (containsFlag ? !accessibilityId.includes(q) : accessibilityId !== q) return false
    }

    return true
  }

  private static _findFirstMatchingElement(
    elements: UiElement[],
    selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }
  ): { el: UiElement, idx: number } | null {
    if (!selector) return null
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!el) continue
      if (ToolsInteract._matchesSelector(el, selector)) return { el, idx: i }
    }
    return null
  }

  private static _isVisibleElement(el: UiElement): boolean {
    const bounds = ToolsInteract._normalizeBounds(el.bounds)
    return !!el.visible && !!bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1]
  }

  private static _computeElementId(platform: 'android' | 'ios', deviceId: string | undefined, el: UiElement, index: number): string {
    const identity = {
      platform,
      deviceId: deviceId || '',
      text: ToolsInteract._normalize(el.text ?? el.label ?? el.value ?? ''),
      resourceId: ToolsInteract._normalize(el.resourceId ?? el.resourceID ?? el.id ?? ''),
      accessibilityId: ToolsInteract._normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? el.label ?? ''),
      class: ToolsInteract._normalize(el.type ?? el.class ?? ''),
      bounds: ToolsInteract._normalizeBounds(el.bounds) ?? [0, 0, 0, 0],
      index
    }
    return `el_${createHash('sha1').update(JSON.stringify(identity)).digest('hex').slice(0, 24)}`
  }

  private static _buildResolvedElement(platform: 'android' | 'ios', deviceId: string | undefined, el: UiElement, index: number) {
    const bounds = ToolsInteract._normalizeBounds(el.bounds)
    const elementId = ToolsInteract._computeElementId(platform, deviceId, el, index)

    ToolsInteract._rememberResolvedElement(elementId, {
      elementId,
      platform,
      deviceId,
      bounds,
      index
    })

    return {
      text: el.text ?? null,
      resource_id: el.resourceId ?? el.resourceID ?? el.id ?? null,
      accessibility_id: el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? el.label ?? null,
      class: el.type ?? el.class ?? null,
      bounds,
      index,
      elementId,
      state: el.state ?? null,
      stable_id: el.stable_id ?? null,
      role: el.role ?? null,
      test_tag: el.test_tag ?? null,
      selector: el.selector ?? null,
      semantic: el.semantic ?? null
    }
  }

  private static _rememberResolvedElement(elementId: string, context: ResolvedUiElementContext) {
    if (ToolsInteract._resolvedUiElements.has(elementId)) {
      ToolsInteract._resolvedUiElements.delete(elementId)
    }

    ToolsInteract._resolvedUiElements.set(elementId, context)

    while (ToolsInteract._resolvedUiElements.size > ToolsInteract._maxResolvedUiElements) {
      const oldestElementId = ToolsInteract._resolvedUiElements.keys().next().value
      if (!oldestElementId) break
      ToolsInteract._resolvedUiElements.delete(oldestElementId)
    }
  }

  private static async _captureFingerprint(platform: 'android' | 'ios', deviceId?: string): Promise<string | null> {
    try {
      const fingerprint = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
      return fingerprint?.fingerprint ?? null
    } catch {
      return null
    }
  }

  private static _buildUiChangeSignatures(tree: any): UiChangeSignatureSet {
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const textPayload: Array<{ text: string, contentDescription: string, resourceId: string }> = []
    const statePayload: Array<{
      checked: boolean | null
      selected: boolean | string | { id: string; label?: string } | null
      focused: boolean | null
      expanded: boolean | null
      enabled: boolean | null
      text_value: string | null
      value: number | string | null
      raw_value: number | string | null
      value_range: UIElementState['value_range']
    }> = []

    for (const el of elements) {
      textPayload.push({
        text: ToolsInteract._normalize(el?.text ?? el?.label ?? el?.value ?? ''),
        contentDescription: ToolsInteract._normalize(el?.contentDescription ?? el?.contentDesc ?? el?.accessibilityLabel ?? ''),
        resourceId: ToolsInteract._normalize(el?.resourceId ?? el?.resourceID ?? el?.id ?? '')
      })

      statePayload.push({
        checked: el?.state?.checked ?? null,
        selected: el?.state?.selected ?? null,
        focused: el?.state?.focused ?? null,
        expanded: el?.state?.expanded ?? null,
        enabled: el?.state?.enabled ?? null,
        text_value: el?.state?.text_value ?? null,
        value: el?.state?.value ?? null,
        raw_value: el?.state?.raw_value ?? null,
        value_range: el?.state?.value_range ?? null
      })
    }

    return {
      hierarchy: computeSnapshotSignature(tree),
      text: ToolsInteract._hash({
        screen: ToolsInteract._normalize(tree?.screen),
        elements: textPayload
      }),
      state: ToolsInteract._hash({
        screen: ToolsInteract._normalize(tree?.screen),
        elements: statePayload
      })
    }
  }

  private static _matchesUiChange(expected: 'hierarchy_diff' | 'text_change' | 'state_change' | undefined, initial: UiChangeSignatureSet, current: UiChangeSignatureSet): 'hierarchy_diff' | 'text_change' | 'state_change' | null {
    const candidates = expected ? [expected] : ToolsInteract._uiChangeKinds

    for (const changeKind of candidates) {
      if (changeKind === 'hierarchy_diff' && initial.hierarchy !== current.hierarchy) return changeKind
      if (changeKind === 'text_change' && initial.text !== current.text) return changeKind
      if (changeKind === 'state_change' && initial.state !== current.state) return changeKind
    }

    return null
  }

  private static _resolvedTargetFromElement(
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
      bounds: ToolsInteract._normalizeBounds(element.bounds),
      index,
      state: element.state ?? null,
      stable_id: element.stable_id ?? null,
      role: element.role ?? null,
      test_tag: element.test_tag ?? null,
      selector: element.selector ?? null,
      semantic: element.semantic ?? null
    }
  }

  private static _summarizeResolutionCandidate(candidate: RankedResolutionCandidate): FindElementResolutionSummary['alternates'][number] {
    const bounds = ToolsInteract._normalizeBounds(candidate.el.bounds)
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

  private static _isAdjustableControl(el: UiElement | null): boolean {
    if (!el) return false
    const type = ToolsInteract._normalize(el.type ?? el.class ?? '')
    const role = ToolsInteract._normalize(el.role ?? '')
    return !!el.state?.value_range || /slider|seekbar|stepper|adjustable|range/.test(type) || /slider|seekbar|stepper|adjustable|range/.test(role)
  }

  private static _isSemanticActionable(el: UiElement | null): boolean {
    if (!el?.semantic) return false
    if (el.semantic.adjustable) return true
    return Array.isArray(el.semantic.supported_actions) && el.semantic.supported_actions.length > 0
  }

  private static _readNumericControlValue(el: UiElement | null, property: string): number | null {
    if (!el?.state) return null
    const stateValue = el.state[property as keyof UIElementState]
    if (typeof stateValue === 'number' && Number.isFinite(stateValue)) return stateValue
    if (property === 'value' || property === 'raw_value') {
      const fallback = el.state.raw_value ?? el.state.value
      if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback
    }
    return null
  }

  private static _buildControlPoint(bounds: [number, number, number, number], ratio: number, axis: 'horizontal' | 'vertical') {
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

  private static _buildConservativeControlPoint(
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
    return ToolsInteract._buildControlPoint(bounds, safeRatio, axis)
  }

  private static _controlAxis(el: UiElement, bounds: [number, number, number, number]): 'horizontal' | 'vertical' {
    const type = ToolsInteract._normalize(el.type ?? el.class ?? '')
    const role = ToolsInteract._normalize(el.role ?? '')
    if (/vertical/.test(type) || /vertical/.test(role)) return 'vertical'
    if (/horizontal/.test(type) || /horizontal/.test(role)) return 'horizontal'
    return (bounds[3] - bounds[1]) > (bounds[2] - bounds[0]) ? 'vertical' : 'horizontal'
  }

  private static _actionFailure(
    actionType: string,
    selector: Record<string, unknown> | null,
    resolved: ActionTargetResolved | null,
    failureCode: ActionFailureCode,
    retryable: boolean,
    uiFingerprintBefore: string | null,
    uiFingerprintAfter?: string | null,
    sourceModule: 'server' | 'interact' = 'interact'
  ): TapElementResponse {
    return buildActionExecutionResult({
      actionType,
      selector,
      resolved,
      success: false,
      uiFingerprintBefore,
      uiFingerprintAfter: uiFingerprintAfter ?? null,
      failure: { failureCode, retryable },
      sourceModule
    })
  }

  static _resetResolvedUiElementsForTests() {
    ToolsInteract._resolvedUiElements.clear()
  }

  private static _findCurrentResolvedElement(
    elements: UiElement[],
    platform: 'android' | 'ios',
    deviceId: string | undefined,
    resolved: ResolvedUiElementContext
  ): { el: UiElement, index: number } | null {
    const indexedCandidate = elements[resolved.index]
    if (indexedCandidate && ToolsInteract._computeElementId(platform, deviceId, indexedCandidate, resolved.index) === resolved.elementId) {
      return { el: indexedCandidate, index: resolved.index }
    }

    return null
  }

  private static _resolveActionableAncestor(elements: UiElement[], chosen: { el: UiElement, idx: number } | null): { el: UiElement, idx: number } | null {
    if (!chosen) return null
    if (chosen.el.clickable || chosen.el.focusable || ToolsInteract._isSemanticActionable(chosen.el)) return chosen

    let current = chosen
    let safety = 0

    while (safety < 20 && current.el && !(current.el.clickable || current.el.focusable || ToolsInteract._isSemanticActionable(current.el)) && current.el.parentId !== undefined && current.el.parentId !== null) {
      const parentId = current.el.parentId
      let parentIndex: number | null = null

      if (typeof parentId === 'number') parentIndex = parentId
      else if (typeof parentId === 'string' && /^\d+$/.test(parentId)) parentIndex = Number(parentId)

      if (parentIndex !== null && elements[parentIndex]) {
        current = { el: elements[parentIndex], idx: parentIndex }
        if (current.el.clickable || current.el.focusable || ToolsInteract._isSemanticActionable(current.el)) return current
      } else if (typeof parentId === 'string') {
        const foundIndex = elements.findIndex((el) => el.resourceId === parentId || el.id === parentId)
        if (foundIndex === -1) break
        current = { el: elements[foundIndex], idx: foundIndex }
        if (current.el.clickable || current.el.focusable || ToolsInteract._isSemanticActionable(current.el)) return current
      } else {
        break
      }

      safety++
    }

    const childBounds = ToolsInteract._normalizeBounds(chosen.el.bounds)
    if (!childBounds) return null
    const [cl, ct, cr, cb] = childBounds

    let best: { el: UiElement, idx: number } | null = null
    let bestArea = Infinity

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!el || !(el.clickable || el.focusable || ToolsInteract._isSemanticActionable(el))) continue
      const bounds = ToolsInteract._normalizeBounds(el.bounds)
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

  private static _resolveNearbyActionableControl(
    elements: UiElement[],
    chosen: { el: UiElement, idx: number } | null,
    screen?: UiResolution | null
  ): { el: UiElement, idx: number, sliderLike?: boolean } | null {
    if (!chosen) return null

    const labelBounds = ToolsInteract._normalizeBounds(chosen.el.bounds)
    if (!labelBounds) return null

    const [labelLeft, labelTop, labelRight, labelBottom] = labelBounds
    const labelWidth = labelRight - labelLeft
    const labelHeight = labelBottom - labelTop
    const screenWidth = Number(screen?.width) > 0 ? Number(screen?.width) : 0
    const screenHeight = Number(screen?.height) > 0 ? Number(screen?.height) : 0
    const minTrackLengthPx = Math.max(
      ToolsInteract._sliderTrackMinLengthPx,
      screenWidth > 0 ? Math.floor(screenWidth * ToolsInteract._sliderTrackLengthRatio) : 0,
      screenHeight > 0 ? Math.floor(screenHeight * ToolsInteract._sliderTrackLengthRatio) : 0
    )
    const maxTrackThicknessPx = Math.max(
      ToolsInteract._sliderTrackMaxThicknessPx,
      screenWidth > 0 ? Math.floor(screenWidth * ToolsInteract._sliderTrackThicknessRatio) : 0,
      screenHeight > 0 ? Math.floor(screenHeight * ToolsInteract._sliderTrackThicknessRatio) : 0
    )

    let best: { el: UiElement, idx: number, sliderLike?: boolean } | null = null
    let bestScore = Infinity

    for (let i = chosen.idx + 1; i < Math.min(elements.length, chosen.idx + ToolsInteract._sliderSearchLookahead); i++) {
      const candidate = elements[i]
      if (!candidate || !(candidate.clickable || candidate.focusable) || candidate.visible === false) continue

      const candidateBounds = ToolsInteract._normalizeBounds(candidate.bounds)
      if (!candidateBounds) continue

      const [left, top, right] = candidateBounds
      const width = right - left
      const height = candidateBounds[3] - top
      const verticalGap = top - labelBottom
      if (verticalGap < -ToolsInteract._sliderNegativeGapTolerancePx || verticalGap > ToolsInteract._sliderPositiveGapLimitPx) continue

      const horizontalOverlap = Math.min(labelRight, right) - Math.max(labelLeft, left)
      if (horizontalOverlap < -ToolsInteract._sliderNegativeGapTolerancePx) continue

      const candidateText = ToolsInteract._normalize(candidate.text ?? candidate.label ?? candidate.value ?? '')
      const candidateContent = ToolsInteract._normalize(candidate.contentDescription ?? candidate.contentDesc ?? candidate.accessibilityLabel ?? '')
      const candidateClass = ToolsInteract._normalize(candidate.type ?? candidate.class ?? '')

      let score = verticalGap
      const horizontalTrackLike =
        width >= Math.max(minTrackLengthPx, Math.floor(labelWidth * ToolsInteract._sliderLabelWidthRatio)) &&
        height <= maxTrackThicknessPx
      const verticalTrackLike =
        height >= Math.max(minTrackLengthPx, Math.floor(labelHeight * ToolsInteract._sliderLabelWidthRatio)) &&
        width <= maxTrackThicknessPx
      const trackLike = /slider|seek|range/i.test(candidateClass) || horizontalTrackLike || verticalTrackLike
      if (!candidateText && !candidateContent) score -= 18
      if (trackLike) score -= 30
      if (/view|layout|group|frame/i.test(candidateClass)) score -= 10
      if (width > labelWidth * ToolsInteract._sliderLabelWidthRatio) score -= 8
      if (candidateText || candidateContent) score += 20

      if (score < bestScore) {
        bestScore = score
        best = { el: candidate, idx: i, sliderLike: trackLike }
      }
    }

    return best
  }


  private static async getInteractionService(platform?: 'android' | 'ios', deviceId?: string) {
    const effectivePlatform = platform || 'android'
    const resolved = await resolveTargetDevice({ platform: effectivePlatform as 'android' | 'ios', deviceId })
    const interact = effectivePlatform === 'android' ? new AndroidInteract() : new iOSInteract()
    return { interact: interact as any, resolved, platform: effectivePlatform }
  }

  static async tapHandler({ platform, x, y, deviceId }: { platform?: 'android' | 'ios', x: number, y: number, deviceId?: string }) {
    const { interact, resolved } = await ToolsInteract.getInteractionService(platform, deviceId)
    return await interact.tap(x, y, resolved.id)
  }

  static async tapElementHandler({ elementId }: { elementId: string }): Promise<TapElementResponse> {
    const actionType = 'tap_element'
    const selector = { elementId }
    const resolved = ToolsInteract._resolvedUiElements.get(elementId)
    if (!resolved) {
      return ToolsInteract._actionFailure(actionType, selector, null, 'STALE_REFERENCE', true, null)
    }

    const fingerprintBefore = await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId)

    const tree = await ToolsObserve.getUITreeHandler({ platform: resolved.platform, deviceId: resolved.deviceId }) as any
    const treePlatform = tree?.device?.platform === 'ios' ? 'ios' : resolved.platform
    const treeDeviceId = tree?.device?.id || resolved.deviceId
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const currentMatch = ToolsInteract._findCurrentResolvedElement(elements, treePlatform, treeDeviceId, resolved)

    if (!currentMatch) {
      return ToolsInteract._actionFailure(actionType, selector, null, 'STALE_REFERENCE', true, fingerprintBefore)
    }

    const resolvedTarget = ToolsInteract._resolvedTargetFromElement(resolved.elementId, currentMatch.el, currentMatch.index)

    if (!ToolsInteract._isVisibleElement(currentMatch.el)) {
      return ToolsInteract._actionFailure(actionType, selector, resolvedTarget, 'ELEMENT_NOT_INTERACTABLE', true, fingerprintBefore)
    }

    if (currentMatch.el.enabled === false) {
      return ToolsInteract._actionFailure(actionType, selector, resolvedTarget, 'ELEMENT_NOT_INTERACTABLE', true, fingerprintBefore)
    }

    const bounds = ToolsInteract._normalizeBounds(currentMatch.el.bounds) ?? resolved.bounds
    if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) {
      return ToolsInteract._actionFailure(actionType, selector, resolvedTarget, 'ELEMENT_NOT_INTERACTABLE', true, fingerprintBefore)
    }

    const x = Math.floor((bounds[0] + bounds[2]) / 2)
    const y = Math.floor((bounds[1] + bounds[3]) / 2)
    const tapResult = await ToolsInteract.tapHandler({ platform: resolved.platform, x, y, deviceId: resolved.deviceId })

    if (!tapResult.success) {
      const fingerprintAfterFailure = await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId)
      return ToolsInteract._actionFailure(actionType, selector, resolvedTarget, 'UNKNOWN', false, fingerprintBefore, fingerprintAfterFailure)
    }

    const fingerprintAfter = await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId)
    return buildActionExecutionResult({
      actionType,
      device: tree?.device,
      selector,
      resolved: resolvedTarget,
      success: true,
      uiFingerprintBefore: fingerprintBefore,
      uiFingerprintAfter: fingerprintAfter,
      sourceModule: 'interact'
    })
  }

  static async adjustControlHandler({
    selector,
    element_id,
    property = 'value',
    targetValue,
    tolerance = 0,
    maxAttempts = 3,
    platform,
    deviceId
  }: {
    selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean },
    element_id?: string,
    property?: string,
    targetValue: number,
    tolerance?: number,
    maxAttempts?: number,
    platform?: 'android' | 'ios',
    deviceId?: string
  }): Promise<AdjustControlResponse> {
    const actionType = 'adjust_control'
    const targetSelector = selector ?? (element_id ? { elementId: element_id } : null)
    const normalizedTolerance = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 0
    const attemptsLimit = Math.max(1, Math.floor(Number(maxAttempts) || 1))
    const sourcePlatform: 'android' | 'ios' = platform || 'android'
    let resolvedPlatform = sourcePlatform
    let resolvedDeviceId = deviceId
    const fingerprintBefore = await ToolsInteract._captureFingerprint(resolvedPlatform, resolvedDeviceId)
    let semanticFallbackElement: FindElementResponse['element'] | null = null

    const buildFailure = (
      failureCode: ActionFailureCode,
      reason: string,
      resolved: ActionTargetResolved | null,
      device: any,
      actualState: { property: string; value: number | null; raw_value?: number | null } | null,
      attempts: number,
      adjustmentMode: 'semantic' | 'gesture' | 'coordinate' = 'gesture',
      retryable = false,
      uiFingerprintAfter: string | null = null
    ): AdjustControlResponse => {
      const base = buildActionExecutionResult({
        actionType,
        sourceModule: 'interact',
        device,
        selector: targetSelector,
        resolved,
        success: false,
        uiFingerprintBefore: fingerprintBefore,
        uiFingerprintAfter,
        failure: { failureCode, retryable },
        details: {
          target_value: targetValue,
          tolerance: normalizedTolerance,
          property,
          attempts,
          adjustment_mode: adjustmentMode,
          actual_state: actualState,
          converged: false,
          within_tolerance: false,
          reason
        }
      }) as AdjustControlResponse

      return {
        ...base,
        target_state: {
          property,
          target_value: targetValue,
          tolerance: normalizedTolerance
        },
        actual_state: actualState,
        within_tolerance: false,
        converged: false,
        attempts,
        adjustment_mode: adjustmentMode
      }
    }

    const resolveCurrentMatch = async (): Promise<{
      tree: any
      device: any
      match: { el: UiElement, idx: number } | null
      resolvedTarget: ActionTargetResolved | null
    } | null> => {
      const tree = await ToolsObserve.getUITreeHandler({ platform: resolvedPlatform, deviceId: resolvedDeviceId }) as any
      resolvedPlatform = tree?.device?.platform === 'ios' ? 'ios' : resolvedPlatform
      resolvedDeviceId = tree?.device?.id || resolvedDeviceId
      const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []

      if (element_id) {
        const stored = ToolsInteract._resolvedUiElements.get(element_id)
        if (!stored) {
          return null
        }
        const current = ToolsInteract._findCurrentResolvedElement(elements, resolvedPlatform, resolvedDeviceId, stored)
        if (!current) {
          return null
        }
        return {
          tree,
          device: tree?.device,
          match: { el: current.el, idx: current.index },
          resolvedTarget: ToolsInteract._resolvedTargetFromElement(
            ToolsInteract._computeElementId(resolvedPlatform, resolvedDeviceId, current.el, current.index),
            current.el,
            current.index
          )
        }
      }

      if (semanticFallbackElement) {
        const fallbackBounds = ToolsInteract._normalizeBounds(
          Array.isArray(semanticFallbackElement.bounds)
            ? semanticFallbackElement.bounds
            : semanticFallbackElement.bounds && typeof semanticFallbackElement.bounds === 'object'
              ? [
                Number((semanticFallbackElement.bounds as any).left),
                Number((semanticFallbackElement.bounds as any).top),
                Number((semanticFallbackElement.bounds as any).right),
                Number((semanticFallbackElement.bounds as any).bottom)
              ]
              : null
        )

        let matchedIndex = -1
        if (fallbackBounds) {
          matchedIndex = elements.findIndex((el) => {
            const bounds = ToolsInteract._normalizeBounds(el.bounds)
            return !!bounds && bounds[0] === fallbackBounds[0] && bounds[1] === fallbackBounds[1] && bounds[2] === fallbackBounds[2] && bounds[3] === fallbackBounds[3]
          })
        }

        if (matchedIndex === -1 && fallbackBounds) {
          const fallbackCenterX = Math.floor((fallbackBounds[0] + fallbackBounds[2]) / 2)
          const fallbackCenterY = Math.floor((fallbackBounds[1] + fallbackBounds[3]) / 2)
          let bestDistance = Infinity
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i]
            if (!ToolsInteract._isAdjustableControl(el)) continue
            const bounds = ToolsInteract._normalizeBounds(el.bounds)
            if (!bounds) continue
            const centerX = Math.floor((bounds[0] + bounds[2]) / 2)
            const centerY = Math.floor((bounds[1] + bounds[3]) / 2)
            const distance = Math.abs(centerX - fallbackCenterX) + Math.abs(centerY - fallbackCenterY)
            if (distance < bestDistance) {
              bestDistance = distance
              matchedIndex = i
            }
          }
        }

        if (matchedIndex >= 0 && elements[matchedIndex]) {
          const matched = { el: elements[matchedIndex], idx: matchedIndex }
          return {
            tree,
            device: tree?.device,
            match: matched,
            resolvedTarget: ToolsInteract._resolvedTargetFromElement(
              ToolsInteract._computeElementId(resolvedPlatform, resolvedDeviceId, matched.el, matched.idx),
              matched.el,
              matched.idx
            )
          }
        }
      }

      if (selector) {
        const matched = ToolsInteract._findFirstMatchingElement(elements, selector)
        if (!matched) {
          return null
        }
        return {
          tree,
          device: tree?.device,
          match: matched,
          resolvedTarget: ToolsInteract._resolvedTargetFromElement(
            ToolsInteract._computeElementId(resolvedPlatform, resolvedDeviceId, matched.el, matched.idx),
            matched.el,
            matched.idx
          )
        }
      }

      return null
    }

    if (!selector && !element_id) {
      return buildFailure('ELEMENT_NOT_FOUND', 'selector or element_id is required', null, undefined, null, 0, 'gesture', false)
    }

    if (selector && !element_id) {
      const waitResult = await ToolsInteract.waitForUIHandler({
        selector,
        condition: 'clickable',
        timeout_ms: 5000,
        poll_interval_ms: 300,
        platform: resolvedPlatform,
        deviceId: resolvedDeviceId
      }) as any

      if (waitResult?.status !== 'success' || !waitResult?.element?.elementId) {
        const semanticQuery = selector.text ?? selector.resource_id ?? selector.accessibility_id ?? ''
        if (!semanticQuery) {
          return buildFailure(
            waitResult?.error?.code === 'ELEMENT_NOT_FOUND' ? 'ELEMENT_NOT_FOUND' : 'TIMEOUT',
            waitResult?.error?.message ?? 'adjustable control not found',
            null,
            waitResult?.device,
            null,
            0,
            'gesture',
            waitResult?.error?.code === 'ELEMENT_NOT_FOUND'
          )
        }

        const fallback = await ToolsInteract.findElementHandler({
          query: semanticQuery,
          exact: false,
          timeoutMs: 3000,
          platform: resolvedPlatform,
          deviceId: resolvedDeviceId
        })

        if (!fallback.found || !fallback.element) {
          return buildFailure(
            'ELEMENT_NOT_FOUND',
            waitResult?.error?.message ?? 'adjustable control not found',
            null,
            waitResult?.device,
            null,
            0,
            'gesture',
            true
          )
        }

        semanticFallbackElement = fallback.element
      } else {
        element_id = waitResult.element.elementId
        semanticFallbackElement = null
      }
    }

    let lastObservedState: { property: string; value: number | null; raw_value?: number | null } | null = null
    let lastAdjustmentMode: 'semantic' | 'gesture' | 'coordinate' = 'gesture'
    let resolvedTarget: ActionTargetResolved | null = null
    let currentDevice: any = undefined
    let attemptCount = 0
    let cachedResolvedMatch: { el: UiElement, idx: number } | null = null

    for (let attempt = 0; attempt < attemptsLimit; attempt++) {
      const resolved: {
        tree: any
        device: any
        match: { el: UiElement, idx: number } | null
        resolvedTarget: ActionTargetResolved | null
      } | null = cachedResolvedMatch
        ? {
          tree: null,
          device: currentDevice,
          match: cachedResolvedMatch,
          resolvedTarget: ToolsInteract._resolvedTargetFromElement(
            ToolsInteract._computeElementId(resolvedPlatform, resolvedDeviceId, cachedResolvedMatch.el, cachedResolvedMatch.idx),
            cachedResolvedMatch.el,
            cachedResolvedMatch.idx
          )
        }
        : await resolveCurrentMatch()
      if (!resolved || !resolved.match || !resolved.resolvedTarget) {
        return buildFailure('STALE_REFERENCE', 'adjustable control could not be resolved', resolvedTarget, currentDevice, lastObservedState, attemptCount, lastAdjustmentMode, true)
      }

      currentDevice = resolved.device
      resolvedTarget = resolved.resolvedTarget
      const currentEl: UiElement = resolved.match.el
      cachedResolvedMatch = resolved.match
      const bounds = ToolsInteract._normalizeBounds(currentEl.bounds)
      const valueRange = currentEl.state?.value_range ?? null
      const currentValue = ToolsInteract._readNumericControlValue(currentEl, property)
      const actualState = currentValue !== null
        ? { property, value: currentValue, raw_value: typeof currentEl.state?.raw_value === 'number' ? currentEl.state.raw_value : undefined }
        : null

      lastObservedState = actualState

      if (property !== 'value' && property !== 'raw_value') {
        return buildFailure('ELEMENT_NOT_INTERACTABLE', 'adjust_control currently supports numeric value and raw_value properties only', resolvedTarget, currentDevice, actualState, attemptCount, lastAdjustmentMode, false)
      }

      if (currentValue !== null && Math.abs(currentValue - targetValue) <= normalizedTolerance) {
        const uiFingerprintAfter = await ToolsInteract._captureFingerprint(resolvedPlatform, resolvedDeviceId)
        const base = buildActionExecutionResult({
          actionType,
          sourceModule: 'interact',
          device: currentDevice,
          selector: targetSelector,
          resolved: resolvedTarget,
          success: true,
          uiFingerprintBefore: fingerprintBefore,
          uiFingerprintAfter,
          details: {
            target_value: targetValue,
            tolerance: normalizedTolerance,
            property,
            attempts: attemptCount,
            adjustment_mode: 'semantic',
            actual_state: actualState,
            converged: true,
            within_tolerance: true,
            reason: 'control already within tolerance'
          }
        }) as AdjustControlResponse

        return {
          ...base,
          target_state: {
            property,
            target_value: targetValue,
            tolerance: normalizedTolerance
          },
          actual_state: actualState,
          within_tolerance: true,
          converged: true,
          attempts: attemptCount,
          adjustment_mode: 'semantic'
        }
      }

      if (!ToolsInteract._isAdjustableControl(currentEl)) {
        return buildFailure('ELEMENT_NOT_INTERACTABLE', 'target is not an adjustable control', resolvedTarget, currentDevice, actualState, attemptCount, lastAdjustmentMode, false)
      }

      if (!bounds) {
        return buildFailure('ELEMENT_NOT_INTERACTABLE', 'adjustable control has no bounds', resolvedTarget, currentDevice, actualState, attemptCount, lastAdjustmentMode, false)
      }

      const min = typeof valueRange?.min === 'number' ? valueRange.min : null
      const max = typeof valueRange?.max === 'number' ? valueRange.max : null
      if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return buildFailure('ELEMENT_NOT_INTERACTABLE', 'value_range unavailable', resolvedTarget, currentDevice, actualState, attemptCount, lastAdjustmentMode, false)
      }

      if (targetValue < min || targetValue > max) {
        return buildFailure('UNKNOWN', `targetValue ${targetValue} is outside the control range ${min}..${max}`, resolvedTarget, currentDevice, actualState, attemptCount, lastAdjustmentMode, false)
      }

      const axis = ToolsInteract._controlAxis(currentEl, bounds)
      const targetPoint = ToolsInteract._buildConservativeControlPoint(bounds, targetValue, currentValue, min, max, axis)
      const currentPoint = currentValue !== null
        ? ToolsInteract._buildControlPoint(bounds, (currentValue - min) / (max - min), axis)
        : ToolsInteract._buildControlPoint(bounds, 0.5, axis)

      const runVerification = async (): Promise<{
        verification: any
        observedState: { property: string; value: number | null; raw_value?: number | null } | null
        withinTolerance: boolean
      }> => {
        const verification = await ToolsInteract.expectStateHandler({
          element_id: resolvedTarget?.elementId ?? element_id,
          selector: selector ?? undefined,
          property,
          expected: targetValue,
          platform: resolvedPlatform,
          deviceId: resolvedDeviceId
        }) as any

        const observedValue = typeof verification?.observed_state?.value === 'number'
          ? verification.observed_state.value
          : typeof verification?.observed_state?.raw_value === 'number'
            ? verification.observed_state.raw_value
            : null
        const observedState = observedValue !== null
          ? {
            property,
            value: observedValue,
            raw_value: typeof verification?.observed_state?.raw_value === 'number' ? verification.observed_state.raw_value : undefined
          }
          : actualState

        return {
          verification,
          observedState,
          withinTolerance: observedValue !== null && Math.abs(observedValue - targetValue) <= normalizedTolerance
        }
      }

      lastAdjustmentMode = 'coordinate'
      const primaryActionResult = await ToolsInteract.tapHandler({
        platform: resolvedPlatform,
        x: targetPoint.x,
        y: targetPoint.y,
        deviceId: resolvedDeviceId
      })
      let actionDevice = primaryActionResult.device ?? currentDevice
      attemptCount++

      if (!primaryActionResult.success) {
        lastAdjustmentMode = 'gesture'
        const fallbackActionResult = await ToolsInteract.swipeHandler({
          platform: resolvedPlatform,
          x1: currentPoint.x,
          y1: currentPoint.y,
          x2: targetPoint.x,
          y2: targetPoint.y,
          duration: 220,
          deviceId: resolvedDeviceId
        })
        attemptCount++

        if (!fallbackActionResult.success) {
          return buildFailure('UNKNOWN', fallbackActionResult.error ?? primaryActionResult.error ?? 'adjustment gesture failed', resolvedTarget, fallbackActionResult.device ?? primaryActionResult.device, actualState, attemptCount, lastAdjustmentMode, false)
        }

        actionDevice = fallbackActionResult.device ?? actionDevice
      }

      let verificationResult = await runVerification()
      let observedState = verificationResult.observedState
      lastObservedState = observedState

      if (!verificationResult.withinTolerance && currentValue !== null) {
        lastAdjustmentMode = 'gesture'
        const fallbackActionResult = await ToolsInteract.swipeHandler({
          platform: resolvedPlatform,
          x1: currentPoint.x,
          y1: currentPoint.y,
          x2: targetPoint.x,
          y2: targetPoint.y,
          duration: 220,
          deviceId: resolvedDeviceId
        })
        attemptCount++
        if (!fallbackActionResult.success) {
          return buildFailure('UNKNOWN', fallbackActionResult.error ?? 'adjustment gesture failed', resolvedTarget, fallbackActionResult.device, observedState ?? actualState, attemptCount, lastAdjustmentMode, false)
        }

        verificationResult = await runVerification()
        observedState = verificationResult.observedState
      }

      const verification = verificationResult.verification
      lastObservedState = observedState

      if (verificationResult.withinTolerance) {
        const uiFingerprintAfter = await ToolsInteract._captureFingerprint(resolvedPlatform, resolvedDeviceId)
        const base = buildActionExecutionResult({
          actionType,
          sourceModule: 'interact',
          device: actionDevice ?? currentDevice,
          selector: targetSelector,
          resolved: resolvedTarget,
          success: true,
          uiFingerprintBefore: fingerprintBefore,
          uiFingerprintAfter,
          details: {
            target_value: targetValue,
            tolerance: normalizedTolerance,
            property,
            attempts: attemptCount,
            adjustment_mode: lastAdjustmentMode,
            actual_state: observedState,
            converged: true,
            within_tolerance: true,
            reason: verification?.reason ?? 'control converged to target value'
          }
        }) as AdjustControlResponse

        return {
          ...base,
          target_state: {
            property,
            target_value: targetValue,
            tolerance: normalizedTolerance
          },
          actual_state: observedState,
          within_tolerance: true,
          converged: true,
          attempts: attemptCount,
          adjustment_mode: lastAdjustmentMode
        }
      }

      cachedResolvedMatch = {
        el: {
          ...currentEl,
          state: {
            ...(currentEl.state ?? null),
            ...(observedState ? {
              [observedState.property]: observedState.value,
              raw_value: observedState.raw_value ?? observedState.value
            } : {})
          }
        },
        idx: resolved.match.idx
      }
    }

    const uiFingerprintAfter = await ToolsInteract._captureFingerprint(resolvedPlatform, resolvedDeviceId)
    return buildFailure('TIMEOUT', 'control did not converge within the allotted attempts', resolvedTarget, currentDevice, lastObservedState, attemptCount, lastAdjustmentMode, true, uiFingerprintAfter)
  }

  static async swipeHandler({ platform = 'android', x1, y1, x2, y2, duration, deviceId }: { platform?: 'android' | 'ios', x1: number, y1: number, x2: number, y2: number, duration: number, deviceId?: string }) {
    const { interact, resolved } = await ToolsInteract.getInteractionService(platform, deviceId)
    return await interact.swipe(x1, y1, x2, y2, duration, resolved.id)
  }

  static async typeTextHandler({ text, deviceId }: { text: string, deviceId?: string }) {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await new AndroidInteract().typeText(text, resolved.id)
  }

  static async pressBackHandler({ deviceId }: { deviceId?: string }) {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await new AndroidInteract().pressBack(resolved.id)
  }

  static async scrollToElementHandler({ platform, selector, direction = 'down', maxScrolls = 10, scrollAmount = 0.7, deviceId }: { platform: 'android' | 'ios', selector: { text?: string, resourceId?: string, contentDesc?: string, className?: string }, direction?: 'down' | 'up', maxScrolls?: number, scrollAmount?: number, deviceId?: string }) {
    const { interact, resolved } = await ToolsInteract.getInteractionService(platform, deviceId)
    return await interact.scrollToElement(selector, direction, maxScrolls, scrollAmount, resolved.id)
  }

  static async findElementHandler({ query, exact = false, timeoutMs = 3000, platform, deviceId }: { query: string, exact?: boolean, timeoutMs?: number, platform?: 'android' | 'ios', deviceId?: string }): Promise<FindElementResponse> {
    // Try to use observe layer to fetch the current UI tree and perform a fast semantic search
    const start = Date.now()
    const deadline = start + timeoutMs
    const normalize = ToolsInteract._normalize

    const q = normalize(query)
    if (!q) return { found: false, error: 'Empty query' }

    let best: RankedResolutionCandidate | null = null
    let bestTree: any = null
    let bestIterationCandidates: RankedResolutionCandidate[] = []
    let shouldStop = false

    const scoreElement = (el: UiElement | null, idx: number): RankedResolutionCandidate | null => {
      if (!el || !el.visible) return null
      const bounds = el.bounds || [0,0,0,0]
      if (!Array.isArray(bounds) || bounds.length < 4) return null
      const [l,t,r,b] = bounds
      if (r <= l || b <= t) return null
      // Do not early-return on non-interactable elements — score them so we can locate their clickable ancestor later
      const interactable = !!(el.clickable || el.enabled || el.focusable || ToolsInteract._isSemanticActionable(el))

      const text = normalize(el.text ?? el.label ?? el.value ?? '')
      const content = normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? '')
      const resourceId = normalize(el.resourceId ?? el.resourceID ?? el.id ?? '')
      const className = normalize(el.type ?? el.class ?? '')
      const semanticRole = normalize(el.semantic?.semantic_role ?? '')
      const semanticActions = Array.isArray(el.semantic?.supported_actions) ? el.semantic.supported_actions.map((action) => normalize(action)).filter(Boolean) : []

      let score = 0
      let reason = 'best_scoring_candidate'
      if (exact) {
        if (text && text === q) {
          score = 1.0
          reason = 'exact_text_match'
        } else if (content && content === q) {
          score = 0.95
          reason = 'exact_content_desc_match'
        } else if (resourceId && resourceId === q) {
          score = 0.92
          reason = 'exact_resource_id_match'
        } else if (className && className === q) {
          score = 0.3
          reason = 'exact_class_match'
        }
      } else {
        if (text && text === q) {
          score = 1.0
          reason = 'exact_text_match'
        } else if (content && content === q) {
          score = 0.95
          reason = 'exact_content_desc_match'
        } else if (resourceId && resourceId === q) {
          score = 0.92
          reason = 'exact_resource_id_match'
        } else if (text && text.includes(q)) {
          score = 0.6
          reason = 'partial_text_match'
        } else if (content && content.includes(q)) {
          score = 0.55
          reason = 'partial_content_desc_match'
        } else if (resourceId && resourceId.includes(q)) {
          score = 0.7
          reason = 'partial_resource_id_match'
        } else if (className && className.includes(q)) {
          score = 0.3
          reason = 'partial_class_match'
        }
      }
      if (!exact) {
        if (!score && semanticRole && semanticRole.includes(q)) {
          score = 0.5
          reason = 'semantic_role_match'
        }
        if (semanticActions.some((action) => action.includes(q))) {
          score = Math.max(score, score > 0 ? 0.65 : 0.6)
          reason = 'semantic_action_match'
        }
        if (score === 0 && el.semantic?.adjustable && /slider|stepper|dropdown|segment|control|adjust/.test(q)) {
          score = 0.45
          reason = 'semantic_control_match'
        }
      } else {
        if (!score && semanticRole && semanticRole === q) {
          score = 0.5
          reason = 'semantic_role_match'
        }
        if (semanticActions.some((action) => action === q)) {
          score = Math.max(score, score > 0 ? 0.65 : 0.6)
          reason = 'semantic_action_match'
        }
      }
      if (score > 0 && interactable) score += 0.05
      if (score <= 0) return null
      return { el, idx, score, reason, interactable }
    }

    while (Date.now() <= deadline) {
      try {
        const tree = await ToolsObserve.getUITreeHandler({ platform, deviceId })
        if (tree && Array.isArray((tree as any).elements)) {
          const elements = ((tree as any).elements as UiElement[])
          const iterationCandidates: RankedResolutionCandidate[] = []
          let iterationImprovedBest = false
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i]
            try {
              const candidate = scoreElement(el, i)
              if (!candidate) continue
              iterationCandidates.push(candidate)
              if (!best || candidate.score > best.score) {
                best = candidate
                bestTree = tree
                iterationImprovedBest = true
                if (best.score >= 0.95) {
                  shouldStop = true
                  break
                }
              }
            } catch (e) { console.error('Error scoring element:', e) }
          }
          if (iterationImprovedBest) {
            bestIterationCandidates = iterationCandidates.slice()
          }
        }
      } catch (e) { console.error('Error fetching UI tree:', e) }
      if (shouldStop || Date.now() > deadline) break
      await new Promise(r => setTimeout(r, 100))
    }

    if (!best) return { found: false, error: 'Element not found' }

    // If the best match is not interactable, try to resolve an actionable ancestor.
    try {
      const elements = (bestTree && Array.isArray(bestTree.elements)) ? (bestTree.elements as UiElement[]) : []
      const screen = bestTree?.resolution && typeof bestTree.resolution === 'object' ? bestTree.resolution as UiResolution : null
      let chosen = best as { el: UiElement, idx: number }
      const childBounds = Array.isArray(chosen?.el?.bounds) ? chosen.el.bounds : null

      // Strategy 1: if parentId references an index, climb that chain
      let resolvedAncestor: { el: UiElement, idx: number } | null = null
      if (childBounds && (chosen.el.parentId !== undefined && chosen.el.parentId !== null)) {
        let cur = chosen
        let safety = 0
        while (cur && safety < 20 && !(cur.el.clickable || cur.el.focusable) && (cur.el.parentId !== undefined && cur.el.parentId !== null)) {
          let pid = cur.el.parentId
          let idx: number | null = null
          if (typeof pid === 'number') idx = pid
          else if (typeof pid === 'string' && /^\d+$/.test(pid)) idx = Number(pid)
          // If parentId is not an index, try to find by matching resourceId or id field
          if (idx !== null && elements[idx]) {
            cur = { el: elements[idx], idx }
            if (cur && (cur.el.clickable || cur.el.enabled || cur.el.focusable)) { resolvedAncestor = cur; break }
          } else if (typeof pid === 'string') {
            // fallback: search elements for matching resourceId or id
            const foundIndex = elements.findIndex((el: UiElement)=> (el.resourceId === pid || el.id === pid))
            const found = foundIndex >= 0 ? elements[foundIndex] : null
            if (found) {
              cur = { el: found, idx: foundIndex }
              if (cur && (cur.el.clickable || cur.el.enabled || cur.el.focusable)) { resolvedAncestor = cur; break }
              // otherwise continue climbing if this found element has its own parentId
            } else {
              break
            }
          } else {
            break
          }
          safety++
        }
      }

      // Strategy 2: fallback - find a clickable element whose bounds fully contain the child's bounds
      if (!resolvedAncestor && childBounds) {
        const [cl,ct,cr,cb] = childBounds
        // find candidates that are clickable and contain the child bounds
        const candidates = elements
          .map((el: UiElement, idx: number) => ({ el, idx }))
          .filter(({ el }) => el && (el.clickable || el.focusable) && Array.isArray(el.bounds) && el.bounds!.length >= 4)
        let bestCandidate: { el: UiElement, idx: number } | null = null
        let bestCandidateArea = Infinity
        for (const c of candidates) {
          const bounds = c.el.bounds as number[]
          const [pl,pt,pr,pb] = bounds
          if (pl <= cl && pt <= ct && pr >= cr && pb >= cb) {
            const area = (pr-pl) * (pb-pt)
            if (area < bestCandidateArea) { bestCandidateArea = area; bestCandidate = c }
          }
        }
        if (bestCandidate) resolvedAncestor = bestCandidate
      }

      if (resolvedAncestor) {
        best = {
          el: resolvedAncestor.el,
          idx: resolvedAncestor.idx,
          score: Math.min(1, best.score + 0.02),
          reason: 'clickable_parent_preferred',
          interactable: true
        }
      }

      if (best && !(best.el.clickable || best.el.focusable || ToolsInteract._isSemanticActionable(best.el))) {
        const nearbyActionable = ToolsInteract._resolveNearbyActionableControl(elements, { el: best.el, idx: best.idx }, screen)
        if (nearbyActionable) {
          best = {
            el: nearbyActionable.el,
            idx: nearbyActionable.idx,
            score: Math.min(1, best.score + 0.02),
            reason: nearbyActionable.sliderLike ? 'slider_track_preferred' : 'nearby_actionable_control',
            interactable: true
          }
        }
      }
    } catch (e) { console.error('Error resolving ancestor:', e) }

    if (!best) return { found: false, error: 'Element not found' }

    const boundsObj = Array.isArray(best.el.bounds) ? { left: best.el.bounds[0], top: best.el.bounds[1], right: best.el.bounds[2], bottom: best.el.bounds[3] } : null
    const tapCoordinates = boundsObj ? { x: Math.floor((boundsObj.left + boundsObj.right) / 2), y: Math.floor((boundsObj.top + boundsObj.bottom) / 2) } : null
    const uniqueRanked = bestIterationCandidates.filter((candidate, index, array) => index === array.findIndex((other) => other.idx === candidate.idx && other.el === candidate.el))
    const alternateCandidates = uniqueRanked
      .filter((candidate) => candidate.idx !== best.idx || candidate.el !== best.el)
      .slice(0, 3)
      .map((candidate) => ToolsInteract._summarizeResolutionCandidate(candidate))

    const outEl = {
      text: best.el.text ?? null,
      resourceId: best.el.resourceId ?? null,
      contentDesc: best.el.contentDescription ?? best.el.contentDesc ?? null,
      class: best.el.type ?? best.el.class ?? null,
      bounds: boundsObj,
      clickable: !!best.el.clickable,
      enabled: !!best.el.enabled,
      stable_id: best.el.stable_id ?? null,
      role: best.el.role ?? null,
      test_tag: best.el.test_tag ?? null,
      selector: best.el.selector ?? null,
      semantic: best.el.semantic ?? null,
      tapCoordinates,
      telemetry: {
        matchedIndex: best.idx ?? null,
        matchedInteractable: !!best.interactable,
        sliderLike: best.reason === 'slider_track_preferred'
      }
    }
    if (best.reason === 'slider_track_preferred') {
      const isVertical = !!boundsObj && (boundsObj.bottom - boundsObj.top) > (boundsObj.right - boundsObj.left)
      const interactionHint = {
        kind: 'slider',
        axis: isVertical ? 'vertical' : 'horizontal',
        trackBounds: boundsObj
      }
      ;(outEl as any).interactionHint = interactionHint
    }
    const scoreVal = Math.min(1, Number(best.score.toFixed(3)))
    const resolution: FindElementResolutionSummary = {
      confidence: scoreVal,
      reason: best.reason,
      fallback_available: alternateCandidates.length > 0,
      matched_count: uniqueRanked.length,
      alternates: alternateCandidates
    }
    return { found: true, element: outEl, score: scoreVal, confidence: scoreVal, resolution }
  }

  static async waitForUIHandler({ selector, condition = 'exists', timeout_ms = 60000, poll_interval_ms = 300, match, retry = { max_attempts: 1, backoff_ms: 0 }, platform, deviceId }: { selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }, condition?: 'exists'|'not_exists'|'visible'|'clickable', timeout_ms?: number, poll_interval_ms?: number, match?: { index?: number }, retry?: { max_attempts?: number, backoff_ms?: number }, platform?: 'android'|'ios', deviceId?: string }) {
    const overallStart = Date.now()
    const requestedIndex = typeof match?.index === 'number' ? match.index : null
    const requested = {
      selector: selector ?? {},
      condition,
      match: requestedIndex === null ? null : { index: requestedIndex }
    }

    // Validate selector: require at least one non-empty field (text, resource_id, or accessibility_id)
    const hasText = typeof selector?.text === 'string' && selector.text.trim().length > 0;
    const hasResId = typeof selector?.resource_id === 'string' && selector.resource_id.trim().length > 0;
    const hasAccId = typeof selector?.accessibility_id === 'string' && selector.accessibility_id.trim().length > 0;

    if (!hasText && !hasResId && !hasAccId) {
      return {
        status: 'timeout',
        error: {
          code: 'INVALID_SELECTOR',
          message: 'Selector must include at least one non-empty field: text, resource_id, or accessibility_id'
        },
        metrics: { latency_ms: Date.now() - overallStart, poll_count: 0, attempts: 0 },
        requested,
        observed: { matched_count: 0, condition_satisfied: false, selected_index: null, last_matched_element: null }
      };
    }

    // Validate condition
    if (!['exists','not_exists','visible','clickable'].includes(condition)) {
      return { status: 'timeout', error: { code: 'INVALID_CONDITION', message: `Unsupported condition: ${condition}` }, metrics: { latency_ms: Date.now() - overallStart, poll_count: 0, attempts: 0 }, requested, observed: { matched_count: 0, condition_satisfied: false, selected_index: null, last_matched_element: null } }
    }

    // Platform check
    if (platform && !['android','ios'].includes(platform)) {
      return { status: 'timeout', error: { code: 'PLATFORM_NOT_SUPPORTED', message: `Unsupported platform: ${platform}` }, metrics: { latency_ms: Date.now() - overallStart, poll_count: 0, attempts: 0 }, requested, observed: { matched_count: 0, condition_satisfied: false, selected_index: null, last_matched_element: null } }
    }

    const effectivePoll = Math.max(50, Math.min(poll_interval_ms || 300, 2000))
    const maxAttempts = (retry && retry.max_attempts) ? Math.max(1, retry.max_attempts) : 1
    const backoff = (retry && retry.backoff_ms) ? Math.max(0, retry.backoff_ms) : 0

    let attempts = 0
    let totalPollCount = 0
    let lastMatchedCount = 0
    let lastMatchedElement: ActionTargetResolved | null = null
    let lastConditionSatisfied = false

    // Precompute normalized selector values and helpers (constant across polls)
    const normalize = ToolsInteract._normalize
    const containsFlag = !!selector?.contains
    const selText = normalize(selector?.text)
    const selRid = normalize(selector?.resource_id)
    const selAid = normalize(selector?.accessibility_id)

    try {
      while (attempts < maxAttempts) {
        attempts++
        const attemptStart = Date.now()
        const deadline = attemptStart + (timeout_ms || 0)

        while (Date.now() <= deadline) {
          totalPollCount++
          try {
            const tree = await ToolsObserve.getUITreeHandler({ platform, deviceId }) as any
            const elements = (tree && Array.isArray(tree.elements)) ? tree.elements as any[] : []

            const matches: { el: any, idx: number }[] = []

            for (let i = 0; i < elements.length; i++) {
              const el = elements[i]
              let ok = true

              // text
              if (selector.text !== undefined && selector.text !== null) {
                const val = normalize(el.text || el.label || el.value || '')
                if (containsFlag) {
                  if (!val.includes(selText)) ok = false
                } else {
                  if (val !== selText) ok = false
                }
              }

              // resource_id
              if (ok && selector.resource_id !== undefined && selector.resource_id !== null) {
                const rid = normalize(el.resourceId || el.resourceID || el.id || '')
                if (containsFlag) {
                  if (!rid.includes(selRid)) ok = false
                } else {
                  if (rid !== selRid) ok = false
                }
              }

              // accessibility_id
              if (ok && selector.accessibility_id !== undefined && selector.accessibility_id !== null) {
                const aid = normalize(el.contentDescription || el.contentDesc || el.accessibilityLabel || el.label || '')
                if (containsFlag) {
                  if (!aid.includes(selAid)) ok = false
                } else {
                  if (aid !== selAid) ok = false
                }
              }

              if (ok) matches.push({ el, idx: i })
            }

            // Evaluate condition
            const matchedCount = matches.length
            const pickIndex = (typeof match?.index === 'number') ? match!.index as number : undefined
            let chosen: { el: any, idx: number } | null = null
            if (matches.length > 0) {
              if (pickIndex !== undefined) {
                // If a specific index is requested but out of bounds, treat as not matched for this poll (deterministic)
                if (pickIndex >= 0 && pickIndex < matches.length) chosen = matches[pickIndex]
                else chosen = null
              } else {
                chosen = matches[0]
              }
            } else {
              chosen = null
            }

            let conditionMet = false
            let matchedElement = chosen
            if (condition === 'exists') {
              // when an index is specified, existence requires that specific index be present
              conditionMet = (pickIndex !== undefined) ? (chosen !== null) : (matchedCount >= 1)
            } else if (condition === 'not_exists') {
              // when an index is specified, not_exists is true if that index is absent
              conditionMet = (pickIndex !== undefined) ? (chosen === null) : (matchedCount === 0)
            } else if (condition === 'visible') {
              if (chosen) {
                const b = chosen.el.bounds
                const visibleFlag = !!chosen.el.visible && Array.isArray(b) && b.length >= 4 && (b[2] > b[0] && b[3] > b[1])
                conditionMet = visibleFlag
              } else conditionMet = false
            } else if (condition === 'clickable') {
              matchedElement = chosen ? (ToolsInteract._resolveActionableAncestor(elements, chosen as { el: UiElement, idx: number }) || chosen) : null
              if (matchedElement) {
                const b = matchedElement.el.bounds
                const visibleFlag = !!matchedElement.el.visible && Array.isArray(b) && b.length >= 4 && (b[2] > b[0] && b[3] > b[1])
                const enabled = !!matchedElement.el.enabled
                const clickable = !!matchedElement.el.clickable || !!matchedElement.el._interactable || !!matchedElement.el.focusable
                conditionMet = visibleFlag && enabled && clickable
              } else conditionMet = false
            }

            const resolvedPlatform = tree?.device?.platform === 'ios' ? 'ios' : (platform || 'android')
            const resolvedDeviceId = tree?.device?.id || deviceId
            lastMatchedCount = matchedCount
            lastConditionSatisfied = conditionMet
            lastMatchedElement = matchedElement ? ToolsInteract._buildResolvedElement(resolvedPlatform, resolvedDeviceId, matchedElement.el, matchedElement.idx) : null

            if (conditionMet) {
              const now = Date.now()
              const latency_ms = now - overallStart
              const outEl = lastMatchedElement

              return {
                status: 'success',
                matched: matchedCount,
                element: outEl,
                metrics: { latency_ms, poll_count: totalPollCount, attempts },
                requested,
                observed: {
                  matched_count: matchedCount,
                  condition_satisfied: true,
                  selected_index: outEl?.index ?? null,
                  last_matched_element: outEl
                }
              }
            }

          } catch (e) {
            // Non-fatal per-poll error; record and continue
            console.warn('waitForUI: poll error (non-fatal):', e instanceof Error ? e.message : String(e))
          }

          // Sleep until next poll
          await new Promise(r => setTimeout(r, effectivePoll || 50))
        }

        // Attempt timed out; if more attempts allowed, backoff then retry
        if (attempts < maxAttempts) {
          if (backoff > 0) await new Promise(r => setTimeout(r, backoff))
          continue
        }

        // Final failure for this call
        const elapsed = Date.now() - overallStart
        const observed = {
          matched_count: lastMatchedCount,
          condition_satisfied: lastConditionSatisfied,
          selected_index: lastMatchedElement?.index ?? null,
          last_matched_element: lastMatchedElement
        }
        const matchNote = requestedIndex !== null && lastMatchedCount <= requestedIndex
          ? ` requested match.index=${requestedIndex} but observed ${lastMatchedCount} match(es)`
          : ` observed ${lastMatchedCount} match(es)`
        return {
          status: 'timeout',
          error: { code: 'ELEMENT_NOT_FOUND', message: `Condition ${condition} not satisfied within timeout;${matchNote}` },
          metrics: { latency_ms: elapsed, poll_count: totalPollCount, attempts },
          requested,
          observed
        }
      }

    } catch (err) {
      const elapsed = Date.now() - overallStart
      return {
        status: 'timeout',
        error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) },
        metrics: { latency_ms: elapsed, poll_count: totalPollCount, attempts },
        requested,
        observed: {
          matched_count: lastMatchedCount,
          condition_satisfied: false,
          selected_index: lastMatchedElement?.index ?? null,
          last_matched_element: lastMatchedElement
        }
      }
    }
  }

  // Helper: normalize various log objects into plain message strings for comparison
  private static _logsToMessages(logsArr: any[]): string[] {
    if (!Array.isArray(logsArr)) return []
    return logsArr.map((l: any) => {
      if (typeof l === 'string') return l
      if (l && (l.message || l.msg)) return l.message || l.msg
      try { return JSON.stringify(l) } catch { return String(l) }
    })
  }

  static async waitForScreenChangeHandler({ platform, previousFingerprint, timeoutMs = 5000, pollIntervalMs = 300, deviceId }: { platform?: 'android' | 'ios', previousFingerprint: string, timeoutMs?: number, pollIntervalMs?: number, deviceId?: string }) {
    const start = Date.now()
    let lastFingerprint: string | null = null
    let lastActivity: string | null = null

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
        const fp = res?.fingerprint ?? null
        lastActivity = (res as any)?.activity ?? lastActivity
        if (fp === null || fp === undefined) {
          lastFingerprint = null
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
          continue
        }

        lastFingerprint = fp

        if (fp !== previousFingerprint) {
          // Stability confirmation
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
              try {
            const confirmRes = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
            const confirmFp = confirmRes?.fingerprint ?? null
            lastActivity = (confirmRes as any)?.activity ?? lastActivity
            if (confirmFp === fp) {
              return {
                success: true,
                previousFingerprint,
                newFingerprint: fp,
                elapsedMs: Date.now() - start,
                observed_screen: {
                  fingerprint: fp,
                  activity: lastActivity
                }
              }
            }
            lastFingerprint = confirmFp
            continue
          } catch (e) { console.error('Error confirming fingerprint:', e); continue }
        }
      } catch (e) { console.error('Error getting screen fingerprint:', e) }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    return {
      success: false,
      reason: 'timeout',
      previousFingerprint,
      lastFingerprint,
      elapsedMs: Date.now() - start,
      observed_screen: {
        fingerprint: lastFingerprint,
        activity: lastActivity
      }
    }
  }

  static async waitForUIChangeHandler({
    platform,
    deviceId,
    timeout_ms = 60000,
    stability_window_ms = 250,
    expected_change
  }: {
    platform?: 'android' | 'ios',
    deviceId?: string,
    timeout_ms?: number,
    stability_window_ms?: number,
    expected_change?: 'hierarchy_diff' | 'text_change' | 'state_change'
  }): Promise<WaitForUIChangeResponse> {
    const start = Date.now()
    const pollIntervalMs = 300
    const stabilityWindow = Math.max(0, typeof stability_window_ms === 'number' ? stability_window_ms : 250)
    let baseline: UiChangeSignatureSet | null = null
    let lastObservedRevision: number | null = null
    let lastLoadingState: any = null

    while (Date.now() - start < timeout_ms) {
      try {
        const tree = await ToolsObserve.getUITreeHandler({ platform, deviceId }) as any
        const signatures = ToolsInteract._buildUiChangeSignatures(tree)
        lastObservedRevision = typeof tree?.snapshot_revision === 'number' ? tree.snapshot_revision : lastObservedRevision
        lastLoadingState = tree?.loading_state ?? lastLoadingState

        if (!baseline) {
          baseline = signatures
        } else {
          const observedChange = ToolsInteract._matchesUiChange(expected_change, baseline, signatures)
          if (observedChange) {
            if (stabilityWindow > 0) {
              await new Promise(resolve => setTimeout(resolve, stabilityWindow))
              const confirmTree = await ToolsObserve.getUITreeHandler({ platform, deviceId }) as any
              const confirmSignatures = ToolsInteract._buildUiChangeSignatures(confirmTree)
              const confirmChange = ToolsInteract._matchesUiChange(expected_change, baseline, confirmSignatures)
              if (!confirmChange || confirmSignatures.hierarchy !== signatures.hierarchy || confirmSignatures.text !== signatures.text || confirmSignatures.state !== signatures.state) {
                lastObservedRevision = typeof confirmTree?.snapshot_revision === 'number' ? confirmTree.snapshot_revision : lastObservedRevision
                lastLoadingState = confirmTree?.loading_state ?? lastLoadingState
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
                continue
              }
              lastObservedRevision = typeof confirmTree?.snapshot_revision === 'number' ? confirmTree.snapshot_revision : lastObservedRevision
              lastLoadingState = confirmTree?.loading_state ?? lastLoadingState
            }

            return {
              success: true,
              observed_change: observedChange,
              snapshot_revision: lastObservedRevision ?? undefined,
              timeout: false,
              elapsed_ms: Date.now() - start,
              expected_change,
              loading_state: lastLoadingState ?? null,
              reason: 'UI change observed'
            }
          }
        }
      } catch {
        // Keep polling until timeout; the observable surface should be best-effort.
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    return {
      success: false,
      observed_change: null,
      snapshot_revision: lastObservedRevision ?? undefined,
      timeout: true,
      elapsed_ms: Date.now() - start,
      expected_change,
      loading_state: lastLoadingState ?? null,
      reason: 'timeout'
    }
  }

  static async expectScreenHandler({
    platform,
    fingerprint,
    screen,
    deviceId
  }: {
    platform?: 'android' | 'ios',
    fingerprint?: string,
    screen?: string,
    deviceId?: string
  }): Promise<ExpectScreenResponse> {
    const observedFingerprint = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as any
    const observedScreen = {
      fingerprint: observedFingerprint?.fingerprint ?? null,
      screen: observedFingerprint?.activity ?? null
    }

    let observedScreenLabel = observedScreen.screen
    if (!fingerprint && screen && platform !== 'ios') {
      try {
        const current = await ToolsObserve.getCurrentScreenHandler({ deviceId }) as any
        observedScreenLabel = current?.shortActivity || current?.activity || observedScreenLabel
      } catch {
        // Keep fingerprint-derived activity when current-screen lookup is unavailable.
      }
    }

    const expectedScreen = {
      fingerprint: fingerprint ?? null,
      screen: screen ?? null
    }

    let success = false
    let basis: 'fingerprint' | 'screen' | 'none' = 'none'
    let reason = 'No fingerprint or screen expectation provided'
    if (fingerprint) {
      basis = 'fingerprint'
      success = observedScreen.fingerprint === fingerprint
      reason = success
        ? `observed fingerprint matches expected fingerprint ${fingerprint}`
        : `expected fingerprint ${fingerprint} but observed ${observedScreen.fingerprint ?? 'null'}`
    } else if (screen) {
      basis = 'screen'
      const candidates = new Set<string>()
      if (observedScreen.screen) candidates.add(observedScreen.screen)
      if (observedScreenLabel) candidates.add(observedScreenLabel)
      success = candidates.has(screen)
      reason = success
        ? `observed screen matches expected screen ${screen}`
        : `expected screen ${screen} but observed ${observedScreenLabel ?? observedScreen.screen ?? 'null'}`
    }

    return {
      success,
      observed_screen: {
        fingerprint: observedScreen.fingerprint,
        screen: observedScreenLabel
      },
      expected_screen: expectedScreen,
      confidence: success ? 1 : 0,
      comparison: {
        basis,
        matched: success,
        reason
      }
    }
  }

  static async expectElementVisibleHandler({
    selector,
    element_id,
    timeout_ms = 5000,
    poll_interval_ms = 300,
    platform,
    deviceId
  }: {
    selector: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean },
    element_id?: string,
    timeout_ms?: number,
    poll_interval_ms?: number,
    platform?: 'android' | 'ios',
    deviceId?: string
  }): Promise<ExpectElementVisibleResponse> {
    const result = await ToolsInteract.waitForUIHandler({
      selector,
      condition: 'visible',
      timeout_ms,
      poll_interval_ms,
      platform,
      deviceId
    }) as any

    if (result?.status === 'success' && result?.element) {
      return {
        success: true,
        selector,
        element_id: result.element.elementId ?? element_id ?? null,
        expected_condition: 'visible',
        element: {
          elementId: result.element.elementId ?? null,
          text: result.element.text ?? null,
          resource_id: result.element.resource_id ?? null,
          accessibility_id: result.element.accessibility_id ?? null,
          class: result.element.class ?? null,
          bounds: result.element.bounds ?? null,
          index: typeof result.element.index === 'number' ? result.element.index : null,
          state: (result.element as any).state ?? null,
          stable_id: (result.element as any).stable_id ?? null,
          role: (result.element as any).role ?? null,
          test_tag: (result.element as any).test_tag ?? null,
          selector: (result.element as any).selector ?? null,
          semantic: (result.element as any).semantic ?? null
        },
        observed: {
          status: result.status,
          matched_count: typeof result.matched === 'number' ? result.matched : result?.observed?.matched_count ?? null,
          condition_satisfied: true,
          selected_index: typeof result.element.index === 'number' ? result.element.index : null,
          last_matched_element: {
            elementId: result.element.elementId ?? null,
            text: result.element.text ?? null,
            resource_id: result.element.resource_id ?? null,
            accessibility_id: result.element.accessibility_id ?? null,
            class: result.element.class ?? null,
            bounds: result.element.bounds ?? null,
            index: typeof result.element.index === 'number' ? result.element.index : null,
            state: (result.element as any).state ?? null,
            stable_id: (result.element as any).stable_id ?? null,
            role: (result.element as any).role ?? null,
            test_tag: (result.element as any).test_tag ?? null,
            selector: (result.element as any).selector ?? null,
            semantic: (result.element as any).semantic ?? null
          }
        },
        reason: 'selector is visible'
      }
    }

    const errorCode = result?.error?.code === 'INTERNAL_ERROR' ? 'UNKNOWN' : 'TIMEOUT'
    return {
      success: false,
      selector,
      element_id: element_id ?? null,
      expected_condition: 'visible',
      observed: {
        status: result?.status,
        matched_count: result?.observed?.matched_count,
        condition_satisfied: result?.observed?.condition_satisfied ?? false,
        selected_index: result?.observed?.selected_index ?? null,
        last_matched_element: result?.observed?.last_matched_element ?? null
      },
      reason: result?.error?.message ?? 'selector is not visible',
      failure_code: errorCode,
      retryable: errorCode === 'TIMEOUT'
    }
  }

  static async expectStateHandler({
    selector,
    element_id,
    property,
    expected,
    platform,
    deviceId
  }: {
    selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean },
    element_id?: string,
    property: string,
    expected: boolean | number | string | Record<string, unknown>,
    platform?: 'android' | 'ios',
    deviceId?: string
  }): Promise<ExpectStateResponse> {
    const tree = await ToolsObserve.getUITreeHandler({ platform, deviceId }) as any
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const treePlatform = tree?.device?.platform === 'ios' ? 'ios' : (platform || 'android')
    const treeDeviceId = tree?.device?.id || deviceId

    let matched: { el: UiElement, idx: number } | null = null

    if (element_id) {
      const resolved = ToolsInteract._resolvedUiElements.get(element_id)
      if (resolved) {
        const current = ToolsInteract._findCurrentResolvedElement(elements, treePlatform, treeDeviceId, resolved)
        if (current) matched = { el: current.el, idx: current.index }
      }
    }

    if (!matched && selector) {
      matched = ToolsInteract._findFirstMatchingElement(elements, selector)
    }

    if (!matched) {
      return {
        success: false,
        selector,
        element_id: element_id ?? null,
        expected_state: { property, expected },
        reason: 'element not found',
        failure_code: 'ELEMENT_NOT_FOUND',
        retryable: true
      }
    }

    const resolvedElement = ToolsInteract._resolvedTargetFromElement(
      ToolsInteract._computeElementId(treePlatform, treeDeviceId, matched.el, matched.idx),
      matched.el,
      matched.idx
    )
    const observedState = matched.el.state ?? null
    const actual = observedState?.[property as keyof UIElementState] ?? null

    const compareBoolean = (value: unknown) => typeof value === 'boolean' ? value : null
    const compareString = (value: unknown) => typeof value === 'string' ? value : null
    const compareNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null

    let success = false
    let reason = ''
    let rawValue: boolean | number | string | null = null
    let observedValue: boolean | number | string | Record<string, unknown> | null = actual as any

    switch (property) {
      case 'checked':
      case 'focused':
      case 'expanded':
      case 'enabled': {
        const expectedBool = compareBoolean(expected)
        const actualBool = compareBoolean(actual)
        if (expectedBool === null) {
          reason = `expected ${property} must be boolean`
        } else if (actualBool === null) {
          reason = `${property} state unavailable`
        } else {
          rawValue = actualBool
          success = actualBool === expectedBool
          reason = success ? `${property} matches expected value` : `expected ${property}=${expectedBool} but observed ${actualBool}`
        }
        observedValue = actualBool
        break
      }
      case 'value':
      case 'raw_value': {
        const expectedNumber = compareNumber(expected)
        const actualNumber = compareNumber(actual)
        if (expectedNumber !== null && actualNumber !== null) {
          success = actualNumber === expectedNumber
          rawValue = actualNumber
          observedValue = actualNumber
          reason = success ? 'value matches expected value' : `expected value=${expectedNumber} but observed ${actualNumber}`
          break
        }
        const expectedString = typeof expected === 'string' ? expected : null
        const actualString = compareString(actual)
        if (expectedString !== null && actualString !== null) {
          success = actualString === expectedString
          rawValue = actualString
          observedValue = actualString
          reason = success ? 'value matches expected value' : `expected value=${expectedString} but observed ${actualString}`
        } else {
          reason = 'value state unavailable'
        }
        break
      }
      case 'selected': {
        const expectedBool = typeof expected === 'boolean' ? expected : null
        const expectedString = typeof expected === 'string'
          ? expected
          : expected && typeof expected === 'object'
            ? String((expected as { id?: unknown; label?: unknown }).id ?? (expected as { id?: unknown; label?: unknown }).label ?? '')
            : null
        if (!observedState || observedState.selected === undefined || observedState.selected === null) {
          reason = 'selected state unavailable'
          break
        }
        if (expectedBool !== null) {
          const actualBool = typeof observedState.selected === 'boolean' ? observedState.selected : null
          if (actualBool === null) {
            reason = 'selected state is not boolean'
            break
          }
          rawValue = actualBool
          observedValue = actualBool
          success = actualBool === expectedBool
          reason = success ? 'selected matches expected value' : `expected selected=${expectedBool} but observed ${actualBool}`
          break
        }
        const actualSelected = typeof observedState.selected === 'object' && observedState.selected !== null
          ? String((observedState.selected as { id?: unknown; label?: unknown }).id ?? (observedState.selected as { id?: unknown; label?: unknown }).label ?? '')
          : String(observedState.selected)
        const actualString = actualSelected.trim()
        if (!expectedString) {
          reason = 'expected selected must be boolean, string, or object with id/label'
          break
        }
        rawValue = actualString
        observedValue = actualString
        success = actualString === expectedString
        reason = success ? 'selected matches expected value' : `expected selected=${expectedString} but observed ${actualString}`
        break
      }
      case 'text_value': {
        const expectedString = typeof expected === 'string' ? expected : null
        const actualString = compareString(actual)
        if (!expectedString) {
          reason = 'expected text_value must be string'
        } else if (!actualString) {
          reason = 'text_value state unavailable'
        } else {
          success = actualString === expectedString
          rawValue = actualString
          observedValue = actualString
          reason = success ? 'text_value matches expected value' : `expected text_value=${expectedString} but observed ${actualString}`
        }
        break
      }
      default: {
        if (actual !== null && actual !== undefined) {
          success = actual === expected
          observedValue = actual as any
          rawValue = typeof actual === 'string' || typeof actual === 'number' || typeof actual === 'boolean' ? actual : null
          reason = success ? `${property} matches expected value` : `expected ${property} to match but observed ${String(actual)}`
        } else {
          reason = `unsupported or unavailable state property: ${property}`
        }
      }
    }

    if (!success && !reason) {
      reason = `${property} did not match expected value`
    }

    return {
      success,
      selector,
      element_id: element_id ?? resolvedElement.elementId,
      expected_state: { property, expected },
      element: {
        ...resolvedElement,
        state: observedState
      },
      observed_state: {
        property,
        value: observedValue,
        ...(rawValue !== null ? { raw_value: rawValue } : {})
      },
      reason,
      ...(success ? {} : { failure_code: 'UNKNOWN', retryable: false })
    }
  }

  static async waitForUICore({ type = 'ui', query, timeoutMs = 30000, pollIntervalMs = 300, includeSnapshotOnFailure = true, match = 'present', stability_ms = 700, observationDelayMs = 0, platform, deviceId }: { type?: 'ui' | 'log' | 'screen' | 'idle', query?: string, timeoutMs?: number, pollIntervalMs?: number, includeSnapshotOnFailure?: boolean, match?: 'present'|'absent', stability_ms?: number, observationDelayMs?: number, platform?: 'android' | 'ios', deviceId?: string }) {
    const start = Date.now()
    const deadline = start + (timeoutMs || 0)
    const q = (query === null || query === undefined) ? '' : String(query)

    // Clamp polling interval to 250-500ms for consistent behavior
    const pollInterval = Math.max(250, Math.min(pollIntervalMs || 300, 500))

    // Baseline state (fetch in parallel but bound to short timeouts so observation starts promptly)
    let initialFingerprint: string | null = null
    let baselineLastLine: string | null = null
    try {
      const fpPromise = ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as Promise<ScreenFingerprintResponse | null>
      const logsPromise = ToolsObserve.getLogsHandler({ platform, deviceId, lines: 200 }) as Promise<any>
      const withTimeout = (p: Promise<any>, ms: number) => Promise.race([p, new Promise(resolve => setTimeout(() => resolve(null), ms))])
      const [fpRes, gl] = await Promise.all([withTimeout(fpPromise, 300), withTimeout(logsPromise, 500)])
      if (fpRes && typeof fpRes === 'object') initialFingerprint = (fpRes as ScreenFingerprintResponse).fingerprint ?? null
      if (gl) {
        const logsArr = Array.isArray((gl as any).logs) ? (gl as any).logs : []
        // Normalize to last message string for baseline comparison
        const msgs = ToolsInteract._logsToMessages(logsArr)
        baselineLastLine = msgs.length ? msgs[msgs.length - 1] : null
      }
    } catch (err) {
      try { console.warn('waitForUI: failed to get baseline data (non-fatal):', err instanceof Error ? err.message : String(err)) } catch { }
    }

    // Network-based waiting removed. Rely on UI and screen fingerprints for determinism.
    let lastChangeAt = Date.now()
    let prevFingerprint = initialFingerprint

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // Optional initial observation delay requested by caller
    if (typeof observationDelayMs === 'number' && observationDelayMs > 0) {
      try { console.log(`waitForUI: delaying observation for ${observationDelayMs}ms`) } catch { }
      await sleep(observationDelayMs)
    }

    // Telemetry
    let pollCount = 0
    let matchedAt: number | null = null
    let lastObservedState: boolean | null = null
    let stableDuration = 0
    let matchSource: string | null = null

    while (Date.now() <= deadline) {
      pollCount++
        const now = Date.now()
        // Evaluate condition per type
        if (type === 'ui') {
          try {
              // Prefer using the public findElementHandler which tests can override. This avoids relying
              // on resolveObserve/getUITree for unit tests which may not have devices available.
              try {
                const findRes = await (ToolsInteract as any).findElementHandler({ query: q, exact: false, timeoutMs: Math.min(500, pollInterval), platform, deviceId })
                const isPresent = !!(findRes && (findRes as any).found)
                const conditionTrue = (match === 'present') ? isPresent : !isPresent
                if (conditionTrue) {
                  if (matchedAt === null) matchedAt = Date.now()
                  stableDuration = Date.now() - (matchedAt as number)
                  lastObservedState = true
                  if (stableDuration >= stability_ms) {
                    matchSource = 'ui-find'
                    const element = isPresent ? (findRes as any).element : null
                    const now2 = Date.now()
                    return { success: true, condition: match, query: q, poll_count: pollCount, duration_ms: now2 - start, stable_duration_ms: stableDuration, matchedElement: element, matchSource, timestamp: now2, type: 'ui', observed_state: lastObservedState ?? null }
                  }
                } else {
                  matchedAt = null
                  stableDuration = 0
                  lastObservedState = false
                }
              } catch (err) { console.error('waitForUI(ui) find error:', err) }
            } catch (err) { console.error('waitForUI(ui) outer error:', err) }
        } else if (type === 'log') {
          try {
            // Logs: presence semantics only (match 'present'). Stability not applicable (immediate)
            const stream = await ToolsObserve.readLogStreamHandler({ platform, sessionId: 'default', limit: 200 }) as any
            const entries = (stream && Array.isArray(stream.entries)) ? stream.entries : []
            for (const ent of entries) {
              const msg = ent && (ent.message || ent.msg || ent) ? (ent.message || ent.msg || ent) : ''
              if (q && String(msg).includes(q)) {
                const now2 = Date.now()
                return { success: true, condition: 'present', query: q, poll_count: pollCount, duration_ms: now2 - start, stable_duration_ms: 0, matchedLog: { message: msg, raw: ent }, matchSource: 'log-stream', timestamp: now2, type: 'log', observed_state: true }
              }
            }

            const gl = await ToolsObserve.getLogsHandler({ platform, deviceId, lines: 200 }) as any
            const logsArr = Array.isArray(gl && gl.logs) ? gl.logs : []
            // Normalize to messages for comparison
            const msgs = ToolsInteract._logsToMessages(logsArr)
            let startIndex = 0
            if (baselineLastLine) {
              const idx = msgs.lastIndexOf(baselineLastLine)
              startIndex = idx >= 0 ? idx + 1 : 0
            }
            for (let i = startIndex; i < msgs.length; i++) {
              const line = msgs[i]
              if (q && String(line).includes(q)) {
                const now2 = Date.now()
                return { success: true, condition: 'present', query: q, poll_count: pollCount, duration_ms: now2 - start, stable_duration_ms: 0, matchedLog: { message: line }, matchSource: 'log-snapshot', timestamp: now2, type: 'log', observed_state: true }
              }
            }
          } catch (err) { console.error('waitForUI(log) error:', err) }
        } else if (type === 'screen') {
          try {
            const fpRes = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
            const fp = fpRes?.fingerprint ?? null
            if (fp !== null && fp !== undefined && fp !== initialFingerprint) {
              // when screen changed, require stability_ms where fingerprint remains the same
              if (matchedAt === null) matchedAt = now
              const confirmFp = (await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null)?.fingerprint ?? null
              if (confirmFp === fp) {
                stableDuration = Date.now() - (matchedAt as number)
                lastObservedState = true
                if (stableDuration >= stability_ms) {
                  const now2 = Date.now()
                  return { success: true, condition: 'present', query: q, poll_count: pollCount, duration_ms: now2 - start, stable_duration_ms: stableDuration, newFingerprint: fp, matchSource: 'screen-fingerprint', timestamp: now2, type: 'screen', observed_state: lastObservedState ?? null }
                }
              } else {
                matchedAt = null
                stableDuration = 0
                lastObservedState = false
              }
            }
          } catch (err) { console.error('waitForUI(screen) error:', err) }
        } else if (type === 'idle') {
          try {
            const fpRes = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
            const fp = fpRes?.fingerprint ?? null
            if (fp !== prevFingerprint) {
              prevFingerprint = fp
              lastChangeAt = Date.now()
              matchedAt = null
              stableDuration = 0
              lastObservedState = false
            } else {
              const idleMs = Date.now() - lastChangeAt
              lastObservedState = true
              if (idleMs >= stability_ms) {
                const now2 = Date.now()
                return { success: true, condition: 'present', query: q, poll_count: pollCount, duration_ms: now2 - start, stable_duration_ms: idleMs, matchSource: 'idle-stable', timestamp: now2, type: 'idle', observed_state: lastObservedState ?? null }
              }
            }
          } catch (err) { console.error('waitForUI(idle) error:', err) }
        }

      // Respect poll interval and avoid tight loop
      await sleep(pollInterval)
    }

    // On timeout, optionally capture a failure snapshot to aid debugging (best-effort)
    let snapshot: any = null
    if (includeSnapshotOnFailure) {
      try {
        // Use dynamic import to avoid circular-initialization issues where the ToolsObserve
        // binding captured earlier may not reflect test-time overrides. Importing at call
        // time ensures the latest exported ToolsObserve object is used.
        const Obs = await import('../observe/index.js')
        snapshot = await (Obs as any).ToolsObserve.captureDebugSnapshotHandler({ reason: `wait_for_ui timeout for ${type}`, includeLogs: true, platform, deviceId })
      } catch (err) {
        snapshot = { error: err instanceof Error ? err.message : String(err) }
      }
    }

    const elapsed = Date.now() - start
    return { success: false, condition: match, query: q, poll_count: pollCount, duration_ms: elapsed, stable_duration_ms: stableDuration, error: 'Timeout waiting for condition', snapshot, observed_state: lastObservedState ?? null }
  }  
}
