import type { UiSelector as ExpectElementSelectorArg } from '../../contracts/selector.js'
import { markEvidenceVerification } from '../../observe/evidence.js'
import { withReadyWait } from '../../observe/readiness-service.js'

import { ToolsInteract } from '../../interact/index.js'
import { recordObservationEvent, withObservationContext } from '../../observe/performance-metrics.js'
import {
  getBooleanArg,
  getNumberArg,
  getObjectArg,
  getStringArg,
  requireNumberArg,
  requireObjectArg,
  requireStringArg,
  ToolCallArgs,
  wrapResponse
} from '../common.js'
import type { PlatformArg, WaitForUiMatchArg, WaitForUiRetryArg } from './handler-types.js'

export async function handleWaitForScreenChange(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const previousFingerprint = requireStringArg(args, 'previousFingerprint')
  const timeoutMs = getNumberArg(args, 'timeoutMs')
  const pollIntervalMs = getNumberArg(args, 'pollIntervalMs')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.waitForScreenChangeHandler({ platform, previousFingerprint, timeoutMs, pollIntervalMs, deviceId })
  return wrapResponse(res)
}

export async function handleExpectScreen(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const fingerprint = getStringArg(args, 'fingerprint')
  const screen = getStringArg(args, 'screen')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.expectScreenHandler({ platform, fingerprint, screen, deviceId })
  return wrapResponse(res)
}

export async function handleExpectElementVisible(args: ToolCallArgs) {
  const selector = requireObjectArg<ExpectElementSelectorArg>(args, 'selector')
  const element_id = getStringArg(args, 'element_id')
  const timeout_ms = getNumberArg(args, 'timeout_ms')
  const poll_interval_ms = getNumberArg(args, 'poll_interval_ms')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.expectElementVisibleHandler({ selector, element_id, timeout_ms, poll_interval_ms, platform, deviceId })
  return wrapResponse(res)
}

export async function handleExpectState(args: ToolCallArgs) {
  const selector = getObjectArg<ExpectElementSelectorArg>(args, 'selector')
  const element_id = getStringArg(args, 'element_id')
  const property = requireStringArg(args, 'property')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  if (!selector && !element_id) {
    throw new Error('Missing selector or element_id argument')
  }
  if (!Object.prototype.hasOwnProperty.call(args, 'expected')) {
    throw new Error('Missing expected argument')
  }
  const expected = args.expected as boolean | number | string | Record<string, unknown>
  const res = await ToolsInteract.expectStateHandler({ selector: selector ?? undefined, element_id: element_id ?? undefined, property, expected, platform, deviceId })
  return wrapResponse(res)
}

export async function handleAdjustControl(args: ToolCallArgs) {
  const selector = getObjectArg<ExpectElementSelectorArg>(args, 'selector')
  const element_id = getStringArg(args, 'element_id')
  const property = getStringArg(args, 'property') ?? 'value'
  const targetValue = requireNumberArg(args, 'targetValue')
  const tolerance = getNumberArg(args, 'tolerance')
  const maxAttempts = getNumberArg(args, 'maxAttempts')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  if ((!selector && !element_id) || (selector && element_id)) {
    throw new Error('Exactly one of selector or element_id argument is required')
  }
  const res = await ToolsInteract.adjustControlHandler({
    selector: selector ?? undefined,
    element_id: element_id ?? undefined,
    property,
    targetValue,
    tolerance,
    maxAttempts,
    platform,
    deviceId
  })
  markEvidenceVerification()
  return wrapResponse(res)
}

export async function handleWaitForUI(args: ToolCallArgs) {
  if (args.requireReady !== undefined && typeof args.requireReady !== 'boolean') throw new Error('INVALID_ARGUMENT: requireReady must be boolean')
  const selector = getObjectArg<ExpectElementSelectorArg>(args, 'selector')
  const condition = (getStringArg(args, 'condition') as 'exists' | 'not_exists' | 'visible' | 'clickable' | undefined) ?? 'exists'
  const timeout_ms = getNumberArg(args, 'timeout_ms') ?? 60000
  const poll_interval_ms = getNumberArg(args, 'poll_interval_ms') ?? 300
  const match = getObjectArg<WaitForUiMatchArg>(args, 'match')
  const retry = getObjectArg<WaitForUiRetryArg>(args, 'retry')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const execute = (targetPlatform = platform, targetId = deviceId) => ToolsInteract.waitForUIHandler({ selector, condition, timeout_ms, poll_interval_ms, match, retry, platform: targetPlatform, deviceId: targetId })
  const res = args.requireReady === true ? await withReadyWait({ platform, deviceId }, timeout_ms,
    device => execute(device.platform as PlatformArg, device.id), (code, elapsed, samples) => ({ status: 'timeout', error: { code, message: 'Readiness wait could not complete' }, metrics: { latency_ms: elapsed, poll_count: samples, attempts: samples ? 1 : 0 }, requested: { selector, condition, match }, observed: { matched_count: 0, condition_satisfied: false, selected_index: null, last_matched_element: null } })) : await execute()
  return wrapResponse(res)
}

export async function handleWaitForUIChange(args: ToolCallArgs) {
  if (args.requireReady !== undefined && typeof args.requireReady !== 'boolean') throw new Error('INVALID_ARGUMENT: requireReady must be boolean')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const timeout_ms = getNumberArg(args, 'timeout_ms') ?? 60000
  const stability_window_ms = getNumberArg(args, 'stability_window_ms') ?? 300
  const expected_change = getStringArg(args, 'expected_change') as 'hierarchy_diff' | 'text_change' | 'state_change' | undefined
  const scope = getStringArg(args, 'scope') as 'screen' | 'subtree' | undefined
  const target = getStringArg(args, 'target')
  const execute = (targetPlatform = platform, targetId = deviceId) => ToolsInteract.waitForUIChangeHandler({ platform: targetPlatform, deviceId: targetId, timeout_ms, stability_window_ms, expected_change, scope, target })
  const res = args.requireReady === true ? await withReadyWait({ platform, deviceId }, timeout_ms,
    device => execute(device.platform as PlatformArg, device.id), (code, elapsed) => ({ success: false, timeout: true, observed_change: null, elapsed_ms: elapsed, reason: code, error: { code, message: 'Readiness wait could not complete' } })) : await execute()
  return wrapResponse(res)
}

export async function handleFindElement(args: ToolCallArgs) {
  const query = requireStringArg(args, 'query')
  const exact = getBooleanArg(args, 'exact') ?? false
  const timeoutMs = getNumberArg(args, 'timeoutMs') ?? 3000
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const targetStarted = performance.now()
  const res = await withObservationContext({ purpose: 'target' }, () => ToolsInteract.findElementHandler({ query, exact, timeoutMs, platform, deviceId }))
  recordObservationEvent({ target_resolution_ms: performance.now() - targetStarted, target_resolution_outcome: res.found ? 'found' : 'not_found', operation: 'find_element' })
  return wrapResponse(res)
}

