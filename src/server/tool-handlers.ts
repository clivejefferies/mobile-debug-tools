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
  inferGenericFailure,
  inferScrollFailure,
  ToolCallArgs,
  ToolHandler,
  wrapResponse
} from './common.js'

async function handleStartApp(args: ToolCallArgs) {
  const { platform, appId, deviceId } = args as any
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
  const { platform, appId, deviceId } = args as any
  const res = await (platform === 'android' ? new AndroidManage().terminateApp(appId, deviceId) : new iOSManage().terminateApp(appId, deviceId))
  const response: TerminateAppResponse = { device: res.device, appTerminated: res.appTerminated }
  return wrapResponse(response)
}

async function handleRestartApp(args: ToolCallArgs) {
  const { platform, appId, deviceId } = args as any
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
  const { platform, appId, deviceId } = args as any
  const res = await (platform === 'android' ? new AndroidManage().resetAppData(appId, deviceId) : new iOSManage().resetAppData(appId, deviceId))
  const response: ResetAppDataResponse = { device: res.device, dataCleared: res.dataCleared }
  return wrapResponse(response)
}

async function handleInstallApp(args: ToolCallArgs) {
  const { platform, projectType, appPath, deviceId } = args as any
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
  const { platform, projectType, projectPath, variant } = args as any
  const res = await ToolsManage.buildAppHandler({ platform, projectPath, variant, projectType })
  return wrapResponse(res)
}

async function handleBuildAndInstall(args: ToolCallArgs) {
  const { platform, projectType, projectPath, deviceId, timeout } = args as any
  const res = await ToolsManage.buildAndInstallHandler({ platform, projectPath, deviceId, timeout, projectType })
  return {
    content: [
      { type: 'text' as const, text: res.ndjson },
      { type: 'text' as const, text: JSON.stringify(res.result, null, 2) }
    ]
  }
}

async function handleGetLogs(args: ToolCallArgs) {
  const { platform, appId, deviceId, pid, tag, level, contains, since_seconds, limit, lines } = args as any
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
  const { platform, appId } = args as any
  const res = await ToolsManage.listDevicesHandler({ platform, appId })
  return wrapResponse(res)
}

async function handleGetSystemStatus() {
  const result = await getSystemStatus()
  return wrapResponse(result)
}

async function handleCaptureScreenshot(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
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
  const { reason, includeLogs, logLines, platform, appId, deviceId, sessionId } = args as any
  const res = await ToolsObserve.captureDebugSnapshotHandler({ reason, includeLogs, logLines, platform, appId, deviceId, sessionId })
  return wrapResponse(res)
}

async function handleGetUITree(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
  const res = await ToolsObserve.getUITreeHandler({ platform, deviceId })
  return wrapResponse(res)
}

async function handleGetCurrentScreen(args: ToolCallArgs) {
  const { deviceId } = args as any
  const res = await ToolsObserve.getCurrentScreenHandler({ deviceId })
  return wrapResponse(res)
}

async function handleGetScreenFingerprint(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
  const res = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId })
  return wrapResponse(res)
}

async function handleWaitForScreenChange(args: ToolCallArgs) {
  const { platform, previousFingerprint, timeoutMs, pollIntervalMs, deviceId } = args as any
  const res = await ToolsInteract.waitForScreenChangeHandler({ platform, previousFingerprint, timeoutMs, pollIntervalMs, deviceId })
  return wrapResponse(res)
}

async function handleExpectScreen(args: ToolCallArgs) {
  const { platform, fingerprint, screen, deviceId } = args as any
  const res = await ToolsInteract.expectScreenHandler({ platform, fingerprint, screen, deviceId })
  return wrapResponse(res)
}

async function handleExpectElementVisible(args: ToolCallArgs) {
  const { selector, element_id, timeout_ms, poll_interval_ms, platform, deviceId } = args as any
  const res = await ToolsInteract.expectElementVisibleHandler({ selector, element_id, timeout_ms, poll_interval_ms, platform, deviceId })
  return wrapResponse(res)
}

async function handleWaitForUI(args: ToolCallArgs) {
  const { selector, condition = 'exists', timeout_ms = 60000, poll_interval_ms = 300, match, retry, platform, deviceId } = args as any
  const res = await ToolsInteract.waitForUIHandler({ selector, condition, timeout_ms, poll_interval_ms, match, retry, platform, deviceId })
  return wrapResponse(res)
}

async function handleFindElement(args: ToolCallArgs) {
  const { query, exact = false, timeoutMs = 3000, platform, deviceId } = args as any
  const res = await ToolsInteract.findElementHandler({ query, exact, timeoutMs, platform, deviceId })
  return wrapResponse(res)
}

async function handleTap(args: ToolCallArgs) {
  const { platform, x, y, deviceId } = args as any
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
  const { elementId } = args as any
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.tapElementHandler({ elementId })
  return wrapResponse(res)
}

async function handleSwipe(args: ToolCallArgs) {
  const { platform = 'android', x1, y1, x2, y2, duration, deviceId } = args as any
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
  const { platform, selector, direction, maxScrolls, scrollAmount, deviceId } = args as any
  const uiFingerprintBefore = await captureActionFingerprint(platform, deviceId)
  ToolsNetwork.notifyActionStart()
  const res = await ToolsInteract.scrollToElementHandler({ platform, selector, direction, maxScrolls, scrollAmount, deviceId })
  const uiFingerprintAfter = await captureActionFingerprint(platform, deviceId)
  return wrapResponse(buildActionExecutionResult({
    actionType: 'scroll_to_element',
    selector,
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
  const { text, deviceId } = args as any
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
  const { deviceId } = args as any
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
  const { platform, packageName, level, sessionId, deviceId } = args as any
  const res = await ToolsObserve.startLogStreamHandler({ platform, packageName, level, sessionId, deviceId })
  return wrapResponse(res)
}

async function handleReadLogStream(args: ToolCallArgs) {
  const { platform, sessionId, limit, since } = args as any
  const res = await ToolsObserve.readLogStreamHandler({ platform, sessionId, limit, since })
  return wrapResponse(res)
}

async function handleStopLogStream(args: ToolCallArgs) {
  const { platform, sessionId } = args as any
  const res = await ToolsObserve.stopLogStreamHandler({ platform, sessionId })
  return wrapResponse(res)
}

function handleClassifyActionOutcome(args: ToolCallArgs) {
  const { uiChanged, expectedElementVisible, networkRequests, hasLogErrors } = args as any
  const result = classifyActionOutcome({
    uiChanged: Boolean(uiChanged),
    expectedElementVisible: expectedElementVisible ?? null,
    networkRequests: networkRequests ?? null,
    hasLogErrors: hasLogErrors ?? null
  })
  return Promise.resolve(wrapResponse(result))
}

async function handleGetNetworkActivity(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
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
  expect_screen: handleExpectScreen,
  expect_element_visible: handleExpectElementVisible,
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
    return {
      content: [{ type: 'text' as const, text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}` }]
    }
  }
}
