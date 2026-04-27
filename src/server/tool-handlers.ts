import type {
  InstallAppResponse,
  ResetAppDataResponse,
  TerminateAppResponse
} from '../types.js'
import { AndroidManage, iOSManage, ToolsManage } from '../manage/index.js'
import { ToolsInteract } from '../interact/index.js'
import { ToolsObserve } from '../observe/index.js'
import { classifyActionOutcome } from '../interact/classify.js'
import { ToolsNetwork } from '../network/index.js'
import { getSystemStatus } from '../system/index.js'
import {
  buildActionExecutionResult,
  captureActionFingerprint,
  getArrayArg,
  getBooleanArg,
  getNumberArg,
  getObjectArg,
  getStringArg,
  inferGenericFailure,
  inferScrollFailure,
  requireBooleanArg,
  requireNumberArg,
  requireObjectArg,
  requireStringArg,
  ToolCallArgs,
  ToolHandler,
  wrapResponse,
  wrapToolError
} from './common.js'

type PlatformArg = 'android' | 'ios'
type ProjectTypeArg = 'native' | 'kmp' | 'react-native' | 'flutter'
type ExpectElementSelectorArg = { text?: string, resource_id?: string, accessibility_id?: string, contains?: boolean }
type WaitForUiMatchArg = { index?: number }
type WaitForUiRetryArg = { max_attempts?: number, backoff_ms?: number }
type ScrollSelectorArg = { text?: string, resourceId?: string, contentDesc?: string, className?: string }
type ClassifyNetworkRequestArg = { endpoint: string, status: 'success' | 'failure' | 'retryable' }

async function handleStartApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint(platform, deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await (platform === 'android' ? new AndroidManage().startApp(appId, deviceId) : new iOSManage().startApp(appId, deviceId))
  const uiFingerprintAfter = await captureActionFingerprint(platform, deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'start_app',
    device: res.device,
    selector: { appId },
    success: !!res.appStarted,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.appStarted ? undefined : inferGenericFailure(res.error),
    details: {
      launch_time_ms: res.launchTimeMs,
      ...(typeof res.output === 'string' ? { output: res.output } : {}),
      ...(res.device ? { device_id: res.device.id } : {}),
      ...(typeof res.error === 'string' ? { error: res.error } : {}),
      ...(res.observedApp ? { observed_app: res.observedApp } : {})
    }
  }))
}

async function handleTerminateApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await (platform === 'android' ? new AndroidManage().terminateApp(appId, deviceId) : new iOSManage().terminateApp(appId, deviceId))
  const response: TerminateAppResponse = { device: res.device, appTerminated: res.appTerminated }
  return wrapResponse(response)
}

async function handleRestartApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint(platform, deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await (platform === 'android' ? new AndroidManage().restartApp(appId, deviceId) : new iOSManage().restartApp(appId, deviceId))
  const uiFingerprintAfter = await captureActionFingerprint(platform, deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'restart_app',
    device: res.device,
    selector: { appId },
    success: !!res.appRestarted,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.appRestarted ? undefined : inferGenericFailure(res.error),
    details: {
      launch_time_ms: res.launchTimeMs,
      ...(typeof res.output === 'string' ? { output: res.output } : {}),
      ...(typeof res.terminatedBeforeRestart === 'boolean' ? { terminated_before_restart: res.terminatedBeforeRestart } : {}),
      ...(typeof res.terminateError === 'string' ? { terminate_error: res.terminateError } : {}),
      ...(typeof res.error === 'string' ? { error: res.error } : {}),
      ...(res.observedApp ? { observed_app: res.observedApp } : {})
    }
  }))
}

async function handleResetAppData(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await (platform === 'android' ? new AndroidManage().resetAppData(appId, deviceId) : new iOSManage().resetAppData(appId, deviceId))
  const response: ResetAppDataResponse = { device: res.device, dataCleared: res.dataCleared }
  return wrapResponse(response)
}

async function handleInstallApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const projectType = requireStringArg(args, 'projectType') as ProjectTypeArg
  const appPath = requireStringArg(args, 'appPath')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsManage.installAppHandler({ platform, appPath, deviceId, projectType })
  const response: InstallAppResponse = {
    device: res.device,
    installed: res.installed,
    output: (res as any).output,
    error: (res as any).error
  }
  return wrapResponse(response)
}

async function handleBuildApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const projectType = requireStringArg(args, 'projectType') as ProjectTypeArg
  const projectPath = requireStringArg(args, 'projectPath')
  const variant = getStringArg(args, 'variant')
  const res = await ToolsManage.buildAppHandler({ platform, projectPath, variant, projectType })
  return wrapResponse(res)
}

async function handleBuildAndInstall(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const projectType = requireStringArg(args, 'projectType') as ProjectTypeArg
  const projectPath = requireStringArg(args, 'projectPath')
  const deviceId = getStringArg(args, 'deviceId')
  const timeout = getNumberArg(args, 'timeout')
  const res = await ToolsManage.buildAndInstallHandler({ platform, projectPath, deviceId, timeout, projectType })
  return {
    content: [
      { type: 'text' as const, text: res.ndjson },
      { type: 'text' as const, text: JSON.stringify(res.result, null, 2) }
    ]
  }
}

async function handleGetLogs(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = getStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const pid = getNumberArg(args, 'pid')
  const tag = getStringArg(args, 'tag')
  const level = getStringArg(args, 'level')
  const contains = getStringArg(args, 'contains')
  const since_seconds = getNumberArg(args, 'since_seconds')
  const limit = getNumberArg(args, 'limit')
  const lines = getNumberArg(args, 'lines')
  const res = await ToolsObserve.getLogsHandler({ platform, appId, deviceId, pid, tag, level, contains, since_seconds, limit, lines })
  const filtered = !!(pid || tag || level || contains || since_seconds || appId)
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ device: res.device, result: { count: res.logCount, filtered, crashLines: (res.crashLines || []), source: res.source, meta: res.meta || {} } }, null, 2) },
      { type: 'text' as const, text: JSON.stringify({ logs: res.logs }, null, 2) }
    ]
  }
}

async function handleListDevices(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const appId = getStringArg(args, 'appId')
  const res = await ToolsManage.listDevicesHandler({ platform, appId })
  return wrapResponse(res)
}

async function handleGetSystemStatus() {
  const result = await getSystemStatus()
  return wrapResponse(result)
}

async function handleCaptureScreenshot(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.captureScreenshotHandler({ platform, deviceId })
  const mime = (res as any).screenshot_mime || 'image/png'
  const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [
    { type: 'text', text: JSON.stringify({ device: res.device, result: { resolution: (res as any).resolution, mimeType: mime } }, null, 2) },
    { type: 'image', data: (res as any).screenshot, mimeType: mime }
  ]
  if ((res as any).screenshot_fallback) {
    content.push({ type: 'text', text: JSON.stringify({ note: 'JPEG fallback included for compatibility', mimeType: (res as any).screenshot_fallback_mime || 'image/jpeg' }) })
    content.push({ type: 'image', data: (res as any).screenshot_fallback, mimeType: (res as any).screenshot_fallback_mime || 'image/jpeg' })
  }
  return { content }
}

async function handleCaptureDebugSnapshot(args: ToolCallArgs) {
  const reason = getStringArg(args, 'reason')
  const includeLogs = getBooleanArg(args, 'includeLogs')
  const logLines = getNumberArg(args, 'logLines')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const appId = getStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const sessionId = getStringArg(args, 'sessionId')
  const res = await ToolsObserve.captureDebugSnapshotHandler({ reason, includeLogs, logLines, platform, appId, deviceId, sessionId })
  return wrapResponse(res)
}

async function handleGetUITree(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.getUITreeHandler({ platform, deviceId })
  return wrapResponse(res)
}

async function handleGetCurrentScreen(args: ToolCallArgs) {
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.getCurrentScreenHandler({ deviceId })
  return wrapResponse(res)
}

async function handleGetScreenFingerprint(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId })
  return wrapResponse(res)
}

async function handleWaitForScreenChange(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const previousFingerprint = requireStringArg(args, 'previousFingerprint')
  const timeoutMs = getNumberArg(args, 'timeoutMs')
  const pollIntervalMs = getNumberArg(args, 'pollIntervalMs')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.waitForScreenChangeHandler({ platform, previousFingerprint, timeoutMs, pollIntervalMs, deviceId })
  return wrapResponse(res)
}

async function handleExpectScreen(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const fingerprint = getStringArg(args, 'fingerprint')
  const screen = getStringArg(args, 'screen')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.expectScreenHandler({ platform, fingerprint, screen, deviceId })
  return wrapResponse(res)
}

async function handleExpectElementVisible(args: ToolCallArgs) {
  const selector = requireObjectArg<ExpectElementSelectorArg>(args, 'selector')
  const element_id = getStringArg(args, 'element_id')
  const timeout_ms = getNumberArg(args, 'timeout_ms')
  const poll_interval_ms = getNumberArg(args, 'poll_interval_ms')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.expectElementVisibleHandler({ selector, element_id, timeout_ms, poll_interval_ms, platform, deviceId })
  return wrapResponse(res)
}

async function handleExpectState(args: ToolCallArgs) {
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

async function handleWaitForUI(args: ToolCallArgs) {
  const selector = getObjectArg<ExpectElementSelectorArg>(args, 'selector')
  const condition = (getStringArg(args, 'condition') as 'exists' | 'not_exists' | 'visible' | 'clickable' | undefined) ?? 'exists'
  const timeout_ms = getNumberArg(args, 'timeout_ms') ?? 60000
  const poll_interval_ms = getNumberArg(args, 'poll_interval_ms') ?? 300
  const match = getObjectArg<WaitForUiMatchArg>(args, 'match')
  const retry = getObjectArg<WaitForUiRetryArg>(args, 'retry')
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.waitForUIHandler({ selector, condition, timeout_ms, poll_interval_ms, match, retry, platform, deviceId })
  return wrapResponse(res)
}

async function handleWaitForUIChange(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const timeout_ms = getNumberArg(args, 'timeout_ms') ?? 60000
  const stability_window_ms = getNumberArg(args, 'stability_window_ms') ?? 250
  const expected_change = getStringArg(args, 'expected_change') as 'hierarchy_diff' | 'text_change' | 'state_change' | undefined
  const res = await ToolsInteract.waitForUIChangeHandler({ platform, deviceId, timeout_ms, stability_window_ms, expected_change })
  return wrapResponse(res)
}

async function handleFindElement(args: ToolCallArgs) {
  const query = requireStringArg(args, 'query')
  const exact = getBooleanArg(args, 'exact') ?? false
  const timeoutMs = getNumberArg(args, 'timeoutMs') ?? 3000
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsInteract.findElementHandler({ query, exact, timeoutMs, platform, deviceId })
  return wrapResponse(res)
}

async function handleTap(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const x = requireNumberArg(args, 'x')
  const y = requireNumberArg(args, 'y')
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint(platform, deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.tapHandler({ platform, x, y, deviceId })
  const uiFingerprintAfter = await captureActionFingerprint(platform, deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'tap',
    selector: { x, y },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  }))
}

async function handleTapElement(args: ToolCallArgs) {
  const elementId = requireStringArg(args, 'elementId')
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.tapElementHandler({ elementId })
  return wrapResponse(res)
}

async function handleSwipe(args: ToolCallArgs) {
  const platform = (getStringArg(args, 'platform') as PlatformArg | undefined) ?? 'android'
  const x1 = requireNumberArg(args, 'x1')
  const y1 = requireNumberArg(args, 'y1')
  const x2 = requireNumberArg(args, 'x2')
  const y2 = requireNumberArg(args, 'y2')
  const duration = requireNumberArg(args, 'duration')
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint(platform, deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.swipeHandler({ platform, x1, y1, x2, y2, duration, deviceId })
  const uiFingerprintAfter = await captureActionFingerprint(platform, deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'swipe',
    selector: { x1, y1, x2, y2, duration },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  }))
}

async function handleScrollToElement(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const selector = requireObjectArg<ScrollSelectorArg>(args, 'selector')
  const direction = getStringArg(args, 'direction') as 'down' | 'up' | undefined
  const maxScrolls = getNumberArg(args, 'maxScrolls')
  const scrollAmount = getNumberArg(args, 'scrollAmount')
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint(platform, deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.scrollToElementHandler({ platform, selector, direction, maxScrolls, scrollAmount, deviceId })
  const uiFingerprintAfter = await captureActionFingerprint(platform, deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'scroll_to_element',
    selector: selector ?? null,
    resolved: res?.success && res?.element ? {
      elementId: null,
      text: (res.element as any).text ?? null,
      resource_id: (res.element as any).resourceId ?? null,
      accessibility_id: (res.element as any).contentDesc ?? null,
      class: (res.element as any).className ?? null,
      bounds: (res.element as any).bounds ?? null,
      index: null
    } : null,
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferScrollFailure((res as any).reason)
  }))
}

async function handleTypeText(args: ToolCallArgs) {
  const text = requireStringArg(args, 'text')
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint('android', deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.typeTextHandler({ text, deviceId })
  const uiFingerprintAfter = await captureActionFingerprint('android', deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'type_text',
    selector: { text },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  }))
}

async function handlePressBack(args: ToolCallArgs) {
  const deviceId = getStringArg(args, 'deviceId')
  const uiFingerprintBefore = await captureActionFingerprint('android', deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.pressBackHandler({ deviceId })
  const uiFingerprintAfter = await captureActionFingerprint('android', deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'press_back',
    selector: { key: 'back' },
    success: !!res.success,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  }))
}

async function handleStartLogStream(args: ToolCallArgs) {
  const platform = (getStringArg(args, 'platform') as PlatformArg | undefined) ?? 'android'
  const packageName = requireStringArg(args, 'packageName')
  const level = (getStringArg(args, 'level') as 'error' | 'warn' | 'info' | 'debug' | undefined) ?? 'error'
  const sessionId = getStringArg(args, 'sessionId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.startLogStreamHandler({ platform, packageName, level, sessionId, deviceId })
  return wrapResponse(res)
}

async function handleReadLogStream(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const sessionId = getStringArg(args, 'sessionId')
  const limit = getNumberArg(args, 'limit')
  const since = getStringArg(args, 'since')
  const res = await ToolsObserve.readLogStreamHandler({ platform, sessionId, limit, since })
  return wrapResponse(res)
}

async function handleStopLogStream(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const sessionId = getStringArg(args, 'sessionId')
  const res = await ToolsObserve.stopLogStreamHandler({ platform, sessionId })
  return wrapResponse(res)
}

function handleClassifyActionOutcome(args: ToolCallArgs) {
  const uiChanged = requireBooleanArg(args, 'uiChanged')
  const expectedElementVisible = getBooleanArg(args, 'expectedElementVisible')
  const networkRequests = getArrayArg<ClassifyNetworkRequestArg>(args, 'networkRequests')
  const hasLogErrors = getBooleanArg(args, 'hasLogErrors')
  const result = classifyActionOutcome({
    uiChanged,
    expectedElementVisible: expectedElementVisible ?? null,
    networkRequests: networkRequests ?? null,
    hasLogErrors: hasLogErrors ?? null
  })
  return Promise.resolve(wrapResponse(result))
}

async function handleGetNetworkActivity(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const result = await ToolsNetwork.getNetworkActivity({ platform, deviceId })
  return wrapResponse(result)
}

export const toolHandlers: Record<string, ToolHandler> = {
  start_app: handleStartApp,
  terminate_app: handleTerminateApp,
  restart_app: handleRestartApp,
  reset_app_data: handleResetAppData,
  install_app: handleInstallApp,
  build_app: handleBuildApp,
  build_and_install: handleBuildAndInstall,
  get_logs: handleGetLogs,
  list_devices: handleListDevices,
  get_system_status: handleGetSystemStatus,
  capture_screenshot: handleCaptureScreenshot,
  capture_debug_snapshot: handleCaptureDebugSnapshot,
  get_ui_tree: handleGetUITree,
  get_current_screen: handleGetCurrentScreen,
  get_screen_fingerprint: handleGetScreenFingerprint,
  wait_for_screen_change: handleWaitForScreenChange,
  wait_for_ui_change: handleWaitForUIChange,
  expect_screen: handleExpectScreen,
  expect_element_visible: handleExpectElementVisible,
  expect_state: handleExpectState,
  wait_for_ui: handleWaitForUI,
  find_element: handleFindElement,
  tap: handleTap,
  tap_element: handleTapElement,
  swipe: handleSwipe,
  scroll_to_element: handleScrollToElement,
  type_text: handleTypeText,
  press_back: handlePressBack,
  start_log_stream: handleStartLogStream,
  read_log_stream: handleReadLogStream,
  stop_log_stream: handleStopLogStream,
  classify_action_outcome: handleClassifyActionOutcome,
  get_network_activity: handleGetNetworkActivity
}

export async function handleToolCall(name: string, args: ToolCallArgs = {}) {
  const handler = toolHandlers[name]
  if (!handler) throw new Error(`Unknown tool: ${name}`)

  try {
    return await handler(args)
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error)
    return wrapToolError(name, error)
  }
}
