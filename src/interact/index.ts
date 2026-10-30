import type { UiTree } from './observation.js'
import { resolveTap } from './tap-target.js'
import { waitForUICore } from './legacy-wait.js'
import type { LegacyWaitInput } from './legacy-wait-state.js'
import { expectState } from './state-assertion.js'
import type { StateInput } from './state-assertion-context.js'
import { waitForUIChange } from './ui-change-wait.js'
import type { ChangeInput } from './ui-change-state.js'
import { waitForScreenChange, type ScreenWaitInput } from './screen-wait.js'
import { expectScreen, type ScreenExpectation } from './screen-assertion.js'
import { expectVisible, type VisibilityInput } from './visibility-assertion.js'
import { findElement, type FindInput } from './find-element.js'
import { waitForUI } from './ui-wait.js'
import type { UIWaitInput } from './ui-wait-state.js'
import { adjustControl } from './adjustment.js'
import type { AdjustmentInput } from './adjustment-context.js'
import type { InputService } from './input-service.js'
import { ResolvedElements } from './resolved-elements.js'
import { findScopedElement, resolveUiChangeScope, type ScopeTree } from './target-scope.js'
import type { ScreenFingerprintResponse, UiElement, ResolvedUiElementContext } from './model.js'
import { _normalizeBounds, _computeElementId, _resolvedTargetFromElement } from './element-helpers.js'
import { _collectSubtreeIndices } from './ui-change-helpers.js'
import { isConditionBlocked } from './conditional-action.js'
import { AndroidInteract } from './android.js';
import { iOSInteract } from './ios.js';
export { AndroidInteract, iOSInteract };

import { resolveTargetDevice } from '../utils/resolve-device.js'
import { ToolsObserve } from '../observe/index.js'
import { buildActionExecutionResult } from '../runtime/action-results.js'
import type {
  ActionFailureCode,
  ActionTargetResolved,
  AdjustControlResponse,
  FindElementResponse,
  ExpectElementVisibleResponse,
  ExpectStateResponse,
  ExpectScreenResponse,
  WaitForUIChangeResponse,
  TapElementResponse
} from '../types.js'

export class ToolsInteract {
  private static readonly _maxResolvedUiElements = 256

  private static _resolvedUiElements = new ResolvedElements(ToolsInteract._maxResolvedUiElements)

  private static _normalizeBounds = _normalizeBounds

  private static _computeElementId = _computeElementId

  private static _buildResolvedElement(platform: 'android' | 'ios', deviceId: string | undefined, el: UiElement, index: number) {
    const bounds = ToolsInteract._normalizeBounds(el.bounds)
    const elementId = ToolsInteract._computeElementId(platform, deviceId, el, index)

    ToolsInteract._rememberResolvedElement(elementId, {
      elementId,
      platform,
      deviceId,
      bounds,
      index,
      stable_id: el.stable_id ?? null
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

  private static _resolveUiChangeScope(tree: ScopeTree | null | undefined, scope: 'screen' | 'subtree' | undefined, target: string | null | undefined) {
    return resolveUiChangeScope(tree, scope, target, (snapshot, id) => ToolsInteract._findScopedElement(snapshot, id))
  }

  private static _findScopedElement(tree: ScopeTree | null | undefined, id: string) {
    return findScopedElement(tree, id, ToolsInteract._resolvedUiElements)
  }

  private static _collectSubtreeIndices = _collectSubtreeIndices

  private static _rememberResolvedElement(elementId: string, context: ResolvedUiElementContext) {
    ToolsInteract._resolvedUiElements.remember(elementId, context)
  }

  private static async _captureFingerprint(platform: 'android' | 'ios', deviceId?: string): Promise<string | null> {
    if (isConditionBlocked()) return null
    try {
      const fingerprint = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as ScreenFingerprintResponse | null
      return fingerprint?.fingerprint ?? null
    } catch {
      return null
    }
  }

  private static _resolvedTargetFromElement = _resolvedTargetFromElement

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

  private static async getInteractionService(platform?: 'android' | 'ios', deviceId?: string) {
    const effectivePlatform = platform || 'android'
    const resolved = await resolveTargetDevice({ platform: effectivePlatform as 'android' | 'ios', deviceId })
    const interact: InputService = effectivePlatform === 'android' ? new AndroidInteract() : new iOSInteract()
    return { interact, resolved, platform: effectivePlatform }
  }

  static async tapHandler({ platform, x, y, deviceId, timeoutMs }: { platform?: 'android' | 'ios', x: number, y: number, deviceId?: string, timeoutMs?: number }) {
    const { interact, resolved } = await ToolsInteract.getInteractionService(platform, deviceId)
    return await interact.tap(x, y, resolved.id, timeoutMs)
  }

  static async tapElementHandler({ elementId, verificationMode = 'full', timeoutMs, platform, deviceId, freshTree }: { elementId: string, verificationMode?: 'none' | 'light' | 'full', timeoutMs?: number, platform?: 'android' | 'ios', deviceId?: string, freshTree?: UiTree }): Promise<TapElementResponse> {
    const actionType = 'tap_element'
    const selector = { elementId }
    const resolved = ToolsInteract._resolvedUiElements.get(elementId)
    if (!resolved || (platform && resolved.platform !== platform) || (deviceId && resolved.deviceId !== deviceId)) {
      return ToolsInteract._actionFailure(actionType, selector, null, 'STALE_REFERENCE', true, null)
    }

    const fingerprintBefore = verificationMode === 'full' ? await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId) : null

    const tree = freshTree ?? await ToolsObserve.getUITreeHandler({ platform: resolved.platform, deviceId: resolved.deviceId })
    const tap = resolveTap(tree, resolved, {
      current: (elements, platform, deviceId, handle) => ToolsInteract._findCurrentResolvedElement(elements, platform, deviceId, handle),
      target: (element, index) => ToolsInteract._resolvedTargetFromElement(resolved.elementId, element, index)
    })
    if ('failure' in tap) return ToolsInteract._actionFailure(actionType, selector, tap.target, tap.failure, true, fingerprintBefore)
    const resolvedTarget = tap.target
    const { x, y } = tap.point
    const tapResult = await ToolsInteract.tapHandler({ platform: resolved.platform, x, y, deviceId: resolved.deviceId, timeoutMs })

    if (!tapResult.success) {
      const fingerprintAfterFailure = verificationMode === 'full' ? await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId) : null
      return { ...ToolsInteract._actionFailure(actionType, selector, resolvedTarget, 'UNKNOWN', false, fingerprintBefore, fingerprintAfterFailure), error: tapResult.error }
    }

    const fingerprintAfter = verificationMode === 'full' ? await ToolsInteract._captureFingerprint(resolved.platform, resolved.deviceId) : null
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

  static async adjustControlHandler(input: AdjustmentInput): Promise<AdjustControlResponse> {
    return adjustControl(input, {
      observe: (platform, deviceId) => ToolsObserve.getUITreeHandler({ platform, deviceId }),
      fingerprint: (platform, deviceId) => ToolsInteract._captureFingerprint(platform, deviceId),
      getHandle: id => ToolsInteract._resolvedUiElements.get(id),
      currentHandle: (elements, platform, deviceId, handle) => ToolsInteract._findCurrentResolvedElement(elements, platform, deviceId, handle),
      target: (platform, deviceId, match) => ToolsInteract._resolvedTargetFromElement(ToolsInteract._computeElementId(platform, deviceId, match.el, match.idx), match.el, match.idx),
      wait: input => ToolsInteract.waitForUIHandler(input), find: input => ToolsInteract.findElementHandler(input),
      expectState: input => ToolsInteract.expectStateHandler(input), service: (platform, deviceId) => ToolsInteract.getInteractionService(platform, deviceId),
      tap: input => ToolsInteract.tapHandler(input), swipe: input => ToolsInteract.swipeHandler(input)
    })
  }

  static async swipeHandler({ platform = 'android', x1, y1, x2, y2, duration, deviceId, timeoutMs }: { platform?: 'android' | 'ios', x1: number, y1: number, x2: number, y2: number, duration: number, deviceId?: string, timeoutMs?: number }) {
    const { interact, resolved } = await ToolsInteract.getInteractionService(platform, deviceId)
    return await interact.swipe(x1, y1, x2, y2, duration, resolved.id, timeoutMs)
  }

  static async typeTextHandler({ text, deviceId, timeoutMs }: { text: string, deviceId?: string, timeoutMs?: number }) {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await new AndroidInteract().typeText(text, resolved.id, timeoutMs)
  }

  static async pressBackHandler({ deviceId, timeoutMs }: { deviceId?: string, timeoutMs?: number }) {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await new AndroidInteract().pressBack(resolved.id, timeoutMs)
  }

  static async scrollToElementHandler({ platform, selector, direction = 'down', maxScrolls = 10, scrollAmount = 0.7, deviceId }: { platform: 'android' | 'ios', selector: { text?: string, resourceId?: string, contentDesc?: string, className?: string }, direction?: 'down' | 'up', maxScrolls?: number, scrollAmount?: number, deviceId?: string }) {
    const { interact, resolved } = await ToolsInteract.getInteractionService(platform, deviceId)
    return await interact.scrollToElement(selector, direction, maxScrolls, scrollAmount, resolved.id)
  }

  static async findElementHandler(input: FindInput): Promise<FindElementResponse> {
    return findElement(input, target => ToolsObserve.getUITreeHandler(target))
  }

  static async waitForUIHandler(input: UIWaitInput) {
    return waitForUI(input, { observe: target => ToolsObserve.getUITreeHandler(target),
      resolve: (platform, deviceId, element, index) => ToolsInteract._buildResolvedElement(platform, deviceId, element, index) })
  }

  static async waitForScreenChangeHandler(input: ScreenWaitInput) {
    return waitForScreenChange(input, { fingerprint: target => ToolsObserve.getScreenFingerprintHandler(target) })
  }

  static async waitForUIChangeHandler(input: ChangeInput): Promise<WaitForUIChangeResponse> {
    return waitForUIChange(input, { observe: target => ToolsObserve.getUITreeHandler(target), scope: (tree, scope, target) => ToolsInteract._resolveUiChangeScope(tree, scope, target) })
  }

  static async expectScreenHandler(input: ScreenExpectation): Promise<ExpectScreenResponse> {
    return expectScreen(input, { fingerprint: target => ToolsObserve.getScreenFingerprintHandler(target), current: target => ToolsObserve.getCurrentScreenHandler(target) })
  }

  static async expectElementVisibleHandler(input: VisibilityInput): Promise<ExpectElementVisibleResponse> {
    return expectVisible(input, request => ToolsInteract.waitForUIHandler(request))
  }

  static async expectStateHandler(input: StateInput): Promise<ExpectStateResponse> {
    return expectState(input, { observe: target => ToolsObserve.getUITreeHandler(target), getHandle: id => ToolsInteract._resolvedUiElements.get(id),
      currentHandle: (elements, platform, deviceId, handle) => ToolsInteract._findCurrentResolvedElement(elements, platform, deviceId, handle),
      target: (platform, deviceId, match) => ToolsInteract._resolvedTargetFromElement(ToolsInteract._computeElementId(platform, deviceId, match.el, match.idx), match.el, match.idx) })
  }

  static async waitForUICore(input: LegacyWaitInput) {
    return waitForUICore(input, { fingerprint: target => ToolsObserve.getScreenFingerprintHandler(target), logs: target => ToolsObserve.getLogsHandler(target),
      stream: target => ToolsObserve.readLogStreamHandler(target), find: input => ToolsInteract.findElementHandler(input),
      snapshot: async input => { const { ToolsObserve } = await import('../observe/index.js'); return ToolsObserve.captureDebugSnapshotHandler(input) } })
  }  
}
