import type { UiSelector as ExpectElementSelectorArg } from '../../contracts/selector.js'
import { measure } from '../../utils/timing.js'
import { runWithBudget } from '../../utils/operation-budget.js'
import { tapElementControlsSchema } from '../schemas/journey-schema.js'
import { notifyActionStart } from '../../interact/conditional-action.js'

import { ToolsInteract } from '../../interact/index.js'
import { recordObservationConsumer, recordObservationEvent, withObservationContext } from '../../observe/performance-metrics.js'
import {
  buildActionExecutionResult,
  captureActionFingerprint,
  getNumberArg,
  getStringArg,
  inferGenericFailure,
  inferScrollFailure,
  requireNumberArg,
  requireObjectArg,
  requireStringArg,
  ToolCallArgs,
  wrapResponse
} from '../common.js'
import type { PlatformArg, ScrollSelectorArg } from './handler-types.js'
import { interactionControls, actionHandler } from './action-execution.js'

export async function executeTap(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const x = requireNumberArg(args, 'x')
  const y = requireNumberArg(args, 'y')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => ToolsInteract.tapHandler({ platform, x, y, deviceId, timeoutMs: actionTimeoutMs }))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'tap',
    sourceModule: 'server',
    selector: { x, y },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure(res.error)
  })
  return wrapResponse(result)
}

export async function executeTapElement(args: ToolCallArgs) {
  const controls = tapElementControlsSchema.safeParse({ elementId: args.elementId, selector: args.selector, waitFor: args.waitFor })
  if (!controls.success) throw new Error(`INVALID_ARGUMENT: ${controls.error.message}`)
  const elementId = controls.data.elementId
  const selector = controls.data.selector as ExpectElementSelectorArg | undefined
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  let resolvedId = elementId
  let freshTree: import('../../interact/observation.js').UiTree | undefined
  if (selector) {
    const waitFor = controls.data.waitFor
    const targetStarted = performance.now()
    const resolutionTimeoutMs = waitFor?.timeoutMs ?? actionTimeoutMs ?? 5000
    const resolution = (await withObservationContext({ stepId: args._stepId as string | undefined, purpose: 'target' }, () =>
      measure('target_resolution_ms', () => runWithBudget(resolutionTimeoutMs, () => ToolsInteract.waitForUIHandler({ selector, condition: waitFor?.condition ?? 'clickable', timeout_ms: resolutionTimeoutMs, poll_interval_ms: waitFor?.pollIntervalMs ?? 100, match: waitFor?.match, singleObservation: true, singleAttempt: !waitFor, rejectAmbiguous: !waitFor, resolveTapTarget: true, platform: getStringArg(args, 'platform') as PlatformArg | undefined, deviceId: getStringArg(args, 'deviceId') })))))!
    recordObservationEvent({ step_id: args._stepId as string | undefined, purpose: 'target', target_resolution_ms: performance.now() - targetStarted, target_resolution_outcome: resolution.status })
    if (resolution.status !== 'success' || !resolution.element?.elementId) return wrapResponse({ success: false, action_type: 'tap_element', failure_code: resolution.error?.code ?? 'ELEMENT_NOT_FOUND', retryable: true })
    resolvedId = resolution.element.elementId
    freshTree = resolution._tree
  }
  notifyActionStart()
  if (freshTree) recordObservationConsumer(freshTree, 'target', args._stepId as string | undefined)
  const res = await measure('dispatch_ms', () => ToolsInteract.tapElementHandler({ elementId: resolvedId!, freshTree, verificationMode, timeoutMs: actionTimeoutMs, platform: getStringArg(args, 'platform') as PlatformArg | undefined, deviceId: getStringArg(args, 'deviceId') }))
  return wrapResponse(res)
}

export async function executeSwipe(args: ToolCallArgs) {
  const platform = (getStringArg(args, 'platform') as PlatformArg | undefined) ?? 'android'
  const x1 = requireNumberArg(args, 'x1')
  const y1 = requireNumberArg(args, 'y1')
  const x2 = requireNumberArg(args, 'x2')
  const y2 = requireNumberArg(args, 'y2')
  const duration = requireNumberArg(args, 'duration')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => ToolsInteract.swipeHandler({ platform, x1, y1, x2, y2, duration, deviceId, timeoutMs: actionTimeoutMs }))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'swipe',
    sourceModule: 'server',
    selector: { x1, y1, x2, y2, duration },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure(res.error)
  })
  return wrapResponse(result)
}

export async function executeScrollToElement(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const selector = requireObjectArg<ScrollSelectorArg>(args, 'selector')
  const direction = getStringArg(args, 'direction') as 'down' | 'up' | undefined
  const maxScrolls = getNumberArg(args, 'maxScrolls')
  const scrollAmount = getNumberArg(args, 'scrollAmount')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => ToolsInteract.scrollToElementHandler({ platform, selector, direction, maxScrolls, scrollAmount, deviceId }))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'scroll_to_element',
    sourceModule: 'server',
    selector: selector ?? null,
    resolved: res?.success && res?.element ? {
      elementId: null,
      text: res.element.text ?? null,
      resource_id: res.element.resourceId ?? null,
      accessibility_id: (res.element as typeof res.element & { contentDesc?: string }).contentDesc ?? null,
      class: (res.element as typeof res.element & { className?: string }).className ?? null,
      bounds: res.element.bounds ?? null,
      index: null
    } : null,
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferScrollFailure(res.reason)
  })
  return wrapResponse(result)
}

export async function executeTypeText(args: ToolCallArgs) {
  const text = requireStringArg(args, 'text')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint('android', deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => ToolsInteract.typeTextHandler({ text, deviceId, timeoutMs: actionTimeoutMs }))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint('android', deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'type_text',
    sourceModule: 'server',
    selector: { text },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure(res.error)
  })
  return wrapResponse(result)
}

export async function executePressBack(args: ToolCallArgs) {
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint('android', deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => ToolsInteract.pressBackHandler({ deviceId, timeoutMs: actionTimeoutMs }))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint('android', deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'press_back',
    sourceModule: 'server',
    selector: { key: 'back' },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure(res.error)
  })
  return wrapResponse(result)
}
export const handleTap = actionHandler('tap', executeTap)
export const handleTapElement = actionHandler('tap_element', executeTapElement)
export const handleSwipe = actionHandler('swipe', executeSwipe)
export const handleScrollToElement = actionHandler('scroll_to_element', executeScrollToElement)
export const handleTypeText = actionHandler('type_text', executeTypeText)
export const handlePressBack = actionHandler('press_back', executePressBack)
