import { createHash } from 'crypto'
import { AndroidInteract } from './android.js';
import { iOSInteract } from './ios.js';
export { AndroidInteract, iOSInteract };

import { resolveTargetDevice } from '../utils/resolve-device.js'
import { ToolsObserve } from '../observe/index.js'
import { nextActionId } from '../server/common.js'
import type {
  ActionFailureCode,
  ActionTargetResolved,
  ExpectElementVisibleResponse,
  ExpectScreenResponse,
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
}

interface ResolvedUiElementContext {
  elementId: string
  platform: 'android' | 'ios'
  deviceId?: string
  bounds: [number, number, number, number] | null
  index: number
}


export class ToolsInteract {
  private static readonly _maxResolvedUiElements = 256
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
      elementId
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
      index
    }
  }

  private static _actionFailure(
    actionId: string,
    timestamp: number,
    actionType: string,
    selector: Record<string, unknown> | null,
    resolved: ActionTargetResolved | null,
    failureCode: ActionFailureCode,
    retryable: boolean,
    uiFingerprintBefore: string | null,
    uiFingerprintAfter?: string | null
  ): TapElementResponse {
    return {
      action_id: actionId,
      timestamp,
      action_type: actionType,
      target: { selector, resolved },
      success: false,
      failure_code: failureCode,
      retryable,
      ui_fingerprint_before: uiFingerprintBefore,
      ui_fingerprint_after: uiFingerprintAfter
    }
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
    if (chosen.el.clickable || chosen.el.focusable) return chosen

    let current = chosen
    let safety = 0

    while (safety < 20 && current.el && !(current.el.clickable || current.el.focusable) && current.el.parentId !== undefined && current.el.parentId !== null) {
      const parentId = current.el.parentId
      let parentIndex: number | null = null

      if (typeof parentId === 'number') parentIndex = parentId
      else if (typeof parentId === 'string' && /^\d+$/.test(parentId)) parentIndex = Number(parentId)

      if (parentIndex !== null && elements[parentIndex]) {
        current = { el: elements[parentIndex], idx: parentIndex }
        if (current.el.clickable || current.el.focusable) return current
      } else if (typeof parentId === 'string') {
        const foundIndex = elements.findIndex((el) => el.resourceId === parentId || el.id === parentId)
        if (foundIndex === -1) break
        current = { el: elements[foundIndex], idx: foundIndex }
        if (current.el.clickable || current.el.focusable) return current
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
      if (!el || !(el.clickable || el.focusable)) continue
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
    const timestamp = Date.now()
    const actionType = 'tap_element'
    const actionId = nextActionId(actionType, timestamp)
    const selector = { elementId }
    const resolved = ToolsInteract._resolvedUiElements.get(elementId)
    if (!resolved) {
      return ToolsInteract._actionFailure(actionId, timestamp, actionType, selector, null, 'STALE_REFERENCE', true, null)
    }

    const fingerprintBefore = await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId)

    const tree = await ToolsObserve.getUITreeHandler({ platform: resolved.platform, deviceId: resolved.deviceId }) as any
    const treePlatform = tree?.device?.platform === 'ios' ? 'ios' : resolved.platform
    const treeDeviceId = tree?.device?.id || resolved.deviceId
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const currentMatch = ToolsInteract._findCurrentResolvedElement(elements, treePlatform, treeDeviceId, resolved)

    if (!currentMatch) {
      return ToolsInteract._actionFailure(actionId, timestamp, actionType, selector, null, 'STALE_REFERENCE', true, fingerprintBefore)
    }

    const resolvedTarget = ToolsInteract._resolvedTargetFromElement(resolved.elementId, currentMatch.el, currentMatch.index)

    if (!ToolsInteract._isVisibleElement(currentMatch.el)) {
      return ToolsInteract._actionFailure(actionId, timestamp, actionType, selector, resolvedTarget, 'ELEMENT_NOT_INTERACTABLE', true, fingerprintBefore)
    }

    if (currentMatch.el.enabled === false) {
      return ToolsInteract._actionFailure(actionId, timestamp, actionType, selector, resolvedTarget, 'ELEMENT_NOT_INTERACTABLE', true, fingerprintBefore)
    }

    const bounds = ToolsInteract._normalizeBounds(currentMatch.el.bounds) ?? resolved.bounds
    if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) {
      return ToolsInteract._actionFailure(actionId, timestamp, actionType, selector, resolvedTarget, 'ELEMENT_NOT_INTERACTABLE', true, fingerprintBefore)
    }

    const x = Math.floor((bounds[0] + bounds[2]) / 2)
    const y = Math.floor((bounds[1] + bounds[3]) / 2)
    const tapResult = await ToolsInteract.tapHandler({ platform: resolved.platform, x, y, deviceId: resolved.deviceId })

    if (!tapResult.success) {
      const fingerprintAfterFailure = await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId)
      return ToolsInteract._actionFailure(actionId, timestamp, actionType, selector, resolvedTarget, 'UNKNOWN', false, fingerprintBefore, fingerprintAfterFailure)
    }

    const fingerprintAfter = await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId)
    return {
      action_id: actionId,
      timestamp,
      action_type: actionType,
      target: {
        selector,
        resolved: resolvedTarget
      },
      success: true,
      ui_fingerprint_before: fingerprintBefore,
      ui_fingerprint_after: fingerprintAfter
    }
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

  static async findElementHandler({ query, exact = false, timeoutMs = 3000, platform, deviceId }: { query: string, exact?: boolean, timeoutMs?: number, platform?: 'android' | 'ios', deviceId?: string }) {
    // Try to use observe layer to fetch the current UI tree and perform a fast semantic search
    const start = Date.now()
    const deadline = start + timeoutMs
    const normalize = ToolsInteract._normalize

    const q = normalize(query)
    if (!q) return { found: false, error: 'Empty query' }

    let best: UiElement | null = null
    let bestScore = 0

    const scoreElement = (el: UiElement | null) => {
      if (!el || !el.visible) return 0
      const bounds = el.bounds || [0,0,0,0]
      if (!Array.isArray(bounds) || bounds.length < 4) return 0
      const [l,t,r,b] = bounds
      if (r <= l || b <= t) return 0
      // Do not early-return on non-interactable elements — score them so we can locate their clickable ancestor later
      const interactable = !!(el.clickable || el.enabled || el.focusable)

      const text = normalize(el.text ?? el.label ?? el.value ?? '')
      const content = normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? '')
      const resourceId = normalize(el.resourceId ?? el.resourceID ?? el.id ?? '')
      const className = normalize(el.type ?? el.class ?? '')

      let score = 0
      if (exact) {
        if (text && text === q) score = 1.0
        else if (content && content === q) score = 0.95
      } else {
        if (text && text === q) score = 1.0
        else if (content && content === q) score = 0.95
        else if (text && text.includes(q)) score = 0.6
        else if (content && content.includes(q)) score = 0.55
        else if (resourceId && resourceId.includes(q)) score = 0.7
        else if (className && className.includes(q)) score = 0.3
      }
      if (score > 0 && interactable) score += 0.05
      return score
    }

    while (Date.now() <= deadline) {
      try {
        const tree = await ToolsObserve.getUITreeHandler({ platform, deviceId })
        if (tree && Array.isArray((tree as any).elements)) {
          const elements = ((tree as any).elements as UiElement[])
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i]
            try {
              const s = scoreElement(el)
              const interactable = !!(el.clickable || el.enabled || (el as any).focusable)
              if (s > bestScore) {
                bestScore = s
                best = el as UiElement
                if (best) { best._index = i; best._interactable = interactable }
              }
              if (bestScore >= 0.95) break
            } catch (e) { console.error('Error scoring element:', e) }
          }
          if (bestScore >= 0.95) break
        }
      } catch (e) { console.error('Error fetching UI tree:', e) }
      if (Date.now() > deadline) break
      await new Promise(r => setTimeout(r, 100))
    }

    if (!best) return { found: false, error: 'Element not found' }

    // If the best match is not interactable, try to resolve an actionable ancestor.
    try {
      const tree = await ToolsObserve.getUITreeHandler({ platform, deviceId }) as any
      const elements = (tree && Array.isArray(tree.elements)) ? (tree.elements as UiElement[]) : []
      let chosen = best as any
      const childBounds = Array.isArray(chosen?.bounds) ? chosen.bounds : null

      // Strategy 1: if parentId references an index, climb that chain
      let resolvedAncestor: any = null
      if (childBounds && (chosen.parentId !== undefined && chosen.parentId !== null)) {
        let cur = chosen
        let safety = 0
        while (cur && safety < 20 && !(cur.clickable || cur.focusable) && (cur.parentId !== undefined && cur.parentId !== null)) {
          let pid = cur.parentId
          let idx: number | null = null
          if (typeof pid === 'number') idx = pid
          else if (typeof pid === 'string' && /^\d+$/.test(pid)) idx = Number(pid)
          // If parentId is not an index, try to find by matching resourceId or id field
          if (idx !== null && elements[idx]) {
            cur = elements[idx]
            if (cur && (cur.clickable || cur.enabled || cur.focusable)) { resolvedAncestor = cur; break }
          } else if (typeof pid === 'string') {
            // fallback: search elements for matching resourceId or id
            const found = elements.find((el: UiElement)=> (el.resourceId === pid || el.id === pid))
            if (found) {
              cur = found
              if (cur && (cur.clickable || cur.enabled || cur.focusable)) { resolvedAncestor = cur; break }
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
        const candidates = elements.filter((el: UiElement)=> el && (el.clickable || el.focusable) && Array.isArray(el.bounds) && el.bounds!.length>=4).map((el: UiElement)=>({el, bounds: el.bounds! as number[]}))
        let bestCandidate: any = null
        let bestCandidateArea = Infinity
        for (const c of candidates) {
          const [pl,pt,pr,pb] = c.bounds
          if (pl <= cl && pt <= ct && pr >= cr && pb >= cb) {
            const area = (pr-pl) * (pb-pt)
            if (area < bestCandidateArea) { bestCandidateArea = area; bestCandidate = c.el }
          }
        }
        if (bestCandidate) resolvedAncestor = bestCandidate
      }

      if (resolvedAncestor) {
        best = resolvedAncestor
        // small score bump to reflect actionability
        bestScore = Math.min(1, bestScore + 0.02)
      }
    } catch (e) { console.error('Error resolving ancestor:', e) }

    if (!best) return { found: false, error: 'Element not found' }

    const boundsObj = Array.isArray(best.bounds) ? { left: best.bounds[0], top: best.bounds[1], right: best.bounds[2], bottom: best.bounds[3] } : null
    const tapCoordinates = boundsObj ? { x: Math.floor((boundsObj.left + boundsObj.right) / 2), y: Math.floor((boundsObj.top + boundsObj.bottom) / 2) } : null

    const outEl = {
      text: best.text ?? null,
      resourceId: best.resourceId ?? null,
      contentDesc: best.contentDescription ?? best.contentDesc ?? null,
      class: best.type ?? best.class ?? null,
      bounds: boundsObj,
      clickable: !!best.clickable,
      enabled: !!best.enabled,
      tapCoordinates,
      telemetry: {
        matchedIndex: best?._index ?? null,
        matchedInteractable: !!best?._interactable
      }
    }
    const scoreVal = Math.min(1, Number(bestScore.toFixed(3)))
    return { found: true, element: outEl, score: scoreVal, confidence: scoreVal }
  }

  static async waitForUIHandler({ selector, condition = 'exists', timeout_ms = 60000, poll_interval_ms = 300, match, retry = { max_attempts: 1, backoff_ms: 0 }, platform, deviceId }: { selector?: { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }, condition?: 'exists'|'not_exists'|'visible'|'clickable', timeout_ms?: number, poll_interval_ms?: number, match?: { index?: number }, retry?: { max_attempts?: number, backoff_ms?: number }, platform?: 'android'|'ios', deviceId?: string }) {
    const overallStart = Date.now()

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
        metrics: { latency_ms: Date.now() - overallStart, poll_count: 0, attempts: 0 }
      };
    }

    // Validate condition
    if (!['exists','not_exists','visible','clickable'].includes(condition)) {
      return { status: 'timeout', error: { code: 'INVALID_CONDITION', message: `Unsupported condition: ${condition}` }, metrics: { latency_ms: Date.now() - overallStart, poll_count: 0, attempts: 0 } }
    }

    // Platform check
    if (platform && !['android','ios'].includes(platform)) {
      return { status: 'timeout', error: { code: 'PLATFORM_NOT_SUPPORTED', message: `Unsupported platform: ${platform}` }, metrics: { latency_ms: Date.now() - overallStart, poll_count: 0, attempts: 0 } }
    }

    const effectivePoll = Math.max(50, Math.min(poll_interval_ms || 300, 2000))
    const maxAttempts = (retry && retry.max_attempts) ? Math.max(1, retry.max_attempts) : 1
    const backoff = (retry && retry.backoff_ms) ? Math.max(0, retry.backoff_ms) : 0

    let attempts = 0
    let totalPollCount = 0

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

            if (conditionMet) {
              const now = Date.now()
              const latency_ms = now - overallStart
              // Build element output per spec
              const resolvedPlatform = tree?.device?.platform === 'ios' ? 'ios' : (platform || 'android')
              const resolvedDeviceId = tree?.device?.id || deviceId
              const outEl = matchedElement ? ToolsInteract._buildResolvedElement(resolvedPlatform, resolvedDeviceId, matchedElement.el, matchedElement.idx) : null

              return {
                status: 'success',
                matched: matchedCount,
                element: outEl,
                metrics: { latency_ms, poll_count: totalPollCount, attempts }
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
        return {
          status: 'timeout',
          error: { code: 'ELEMENT_NOT_FOUND', message: `Condition ${condition} not satisfied within timeout` },
          metrics: { latency_ms: elapsed, poll_count: totalPollCount, attempts }
        }
      }

    } catch (err) {
      const elapsed = Date.now() - overallStart
      return { status: 'timeout', error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) }, metrics: { latency_ms: elapsed, poll_count: totalPollCount, attempts } }
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

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
        const fp = res?.fingerprint ?? null
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
            if (confirmFp === fp) {
              return { success: true, newFingerprint: fp, elapsedMs: Date.now() - start }
            }
            lastFingerprint = confirmFp
            continue
          } catch (e) { console.error('Error confirming fingerprint:', e); continue }
        }
      } catch (e) { console.error('Error getting screen fingerprint:', e) }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    return { success: false, reason: 'timeout', lastFingerprint, elapsedMs: Date.now() - start }
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
    if (fingerprint) {
      success = observedScreen.fingerprint === fingerprint
    } else if (screen) {
      const candidates = new Set<string>()
      if (observedScreen.screen) candidates.add(observedScreen.screen)
      if (observedScreenLabel) candidates.add(observedScreenLabel)
      success = candidates.has(screen)
    }

    return {
      success,
      observed_screen: {
        fingerprint: observedScreen.fingerprint,
        screen: observedScreenLabel
      },
      expected_screen: expectedScreen,
      confidence: success ? 1 : 0
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
        element: {
          elementId: result.element.elementId ?? null,
          text: result.element.text ?? null,
          resource_id: result.element.resource_id ?? null,
          accessibility_id: result.element.accessibility_id ?? null,
          class: result.element.class ?? null,
          bounds: result.element.bounds ?? null,
          index: typeof result.element.index === 'number' ? result.element.index : null
        }
      }
    }

    const errorCode = result?.error?.code === 'INTERNAL_ERROR' ? 'UNKNOWN' : 'TIMEOUT'
    return {
      success: false,
      selector,
      element_id: element_id ?? null,
      failure_code: errorCode,
      retryable: errorCode === 'TIMEOUT'
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
