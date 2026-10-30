import type { DeviceInfo } from '../../types.js'
import { handleDebugger } from './debugger-handlers.js'
import { debuggerContracts } from '../schemas/debugger-schema.js'
import { debuggerSessions } from '../../debugger/sessions.js'
import { withDebuggerGuard, guardDispatched } from '../../debugger/guard.js'
import { TraceError } from '../../observe/system-trace.js'
import { systemTraceTools } from '../schemas/system-trace-schema.js'
import { withTiming } from '../../utils/timing.js'
import { readinessSchema, readinessWaitSchema } from '../schemas/readiness-schema.js'
import { getAppReadiness } from '../../observe/readiness-service.js'
import { validateExpectedState } from '../schemas/condition-schema.js'
import { resolveTargetDevice, withResolvedDevice } from '../../utils/resolve-device.js'

import {
  ToolCallArgs,
  ToolCallResult,
  ToolHandler,
  wrapResponse,
  wrapToolError
} from '../common.js'
import { handleTerminateApp, handleResetAppData, handleInstallApp, handleBuildApp, handleBuildAndInstall, handleStartApp, handleRestartApp } from './manage.js'
import { handleGetLogs, handleCaptureScreenshot, handleCaptureDebugSnapshot, handleGetUITree, handleGetCurrentScreen, handleGetScreenFingerprint, handleStartLogStream, handleReadLogStream, handleStopLogStream } from './observe.js'
import { handleWaitForScreenChange, handleExpectScreen, handleExpectElementVisible, handleExpectState, handleAdjustControl, handleWaitForUI, handleWaitForUIChange, handleFindElement } from './interact.js'
import { handleTap, handleTapElement, handleSwipe, handleScrollToElement, handleTypeText, handlePressBack } from './input.js'
import { handleRunJourney } from './journey.js'
import { handleListDevices, handleGetSystemStatus, handleClassifyActionOutcome, handleGetNetworkActivity, handleSystemTrace } from './diagnostic.js'
import { correlatedHandler } from './action-execution.js'

const systemTraceToolNames = new Set(systemTraceTools.map(tool => tool.name))

export const toolHandlers: Record<string, ToolHandler> = {
  ...Object.fromEntries(systemTraceTools.map(({ name }) => [name, (args: ToolCallArgs) => handleSystemTrace(name, args)])),
  get_app_readiness: async args => {
    const parsed = readinessSchema.safeParse(args)
    if (!parsed.success) throw new Error('INVALID_ARGUMENT: invalid readiness arguments')
    return wrapResponse(await getAppReadiness(parsed.data))
  },
  wait_for_app_ready: async args => {
    const parsed = readinessWaitSchema.safeParse(args)
    if (!parsed.success) throw new Error('INVALID_ARGUMENT: invalid readiness arguments')
    return wrapResponse(await getAppReadiness(parsed.data, true))
  },
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
  adjust_control: handleAdjustControl,
  wait_for_ui: handleWaitForUI,
  find_element: handleFindElement,
  tap: handleTap,
  tap_element: handleTapElement,
  run_journey: handleRunJourney,
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

for (const name of ['capture_screenshot', 'get_ui_tree', 'get_screen_fingerprint', 'capture_debug_snapshot', 'get_logs', 'read_log_stream', 'run_journey', 'adjust_control']) {
  toolHandlers[name] = correlatedHandler(name, toolHandlers[name], name === 'adjust_control', name === 'run_journey')
}

async function dispatchGuarded(device: DeviceInfo, args: ToolCallArgs, handler: ToolHandler, addTiming: (response: ToolCallResult) => ToolCallResult) {
  return withResolvedDevice(device, () => withDebuggerGuard('android', device.id, async () => {
    const before = debuggerSessions.paused(device.id)
    if (before) return wrapResponse({ success: false, failure_code: 'DEBUGGER_PAUSED', delivery_status: 'not_delivered', dispatch_started: false, debugger: before })
    let response: ToolCallResult
    try { response = await handler(args) } catch (error) {
      if (!debuggerSessions.paused(device.id)) throw error
      response = wrapResponse({ success: false })
    }
    const pause = debuggerSessions.paused(device.id)
    if (pause) {
      const item = response.content.find(item => item.type === 'text')
      if (item?.text) {
        const payload = JSON.parse(item.text)
        Object.assign(payload, { success: false, failure_code: 'DEBUGGER_PAUSED', retryable: false,
          dispatch_started: guardDispatched(), delivery_status: payload.success ? 'delivered' : guardDispatched() ? 'unknown' : 'not_delivered',
          verification: { status: 'blocked', reason: 'DEBUGGER_PAUSED' }, debugger: pause })
        item.text = JSON.stringify(payload)
      }
    }
    return addTiming(response)
  }))
}

function attachPausedObservation(name: string, args: ToolCallArgs, response: ToolCallResult) {
  if (['capture_screenshot', 'get_ui_tree', 'get_screen_fingerprint', 'capture_debug_snapshot', 'get_logs', 'get_current_screen', 'read_log_stream'].includes(name) && args.platform !== 'ios') {
    const item = response.content.find(item => item.type === 'text')
    if (item?.text) {
      try {
        const payload = JSON.parse(item.text)
        const device = payload.device ?? payload.evidence?.device
        const id = device?.id ?? args.deviceId
        const pause = id && device?.platform !== 'ios' ? debuggerSessions.paused(String(id)) : null
        if (pause) item.text = JSON.stringify({ ...payload, debugger: pause })
      } catch { /* Non-JSON observation */ }
    }
  }
}

export async function handleToolCall(name: string, args: ToolCallArgs = {}, signal?: AbortSignal) {
  if (Object.hasOwn(debuggerContracts, name)) return handleDebugger(name, args, signal)
  const handler = toolHandlers[name]
  if (!handler) throw new Error(`Unknown tool: ${name}`)

  const started = performance.now()
  const measured: Record<string, number> = {}
  const addTiming = (response: ToolCallResult) => {
    if (!['start_app', 'restart_app', 'tap', 'tap_element', 'swipe', 'scroll_to_element', 'type_text', 'press_back', 'wait_for_ui', 'get_ui_tree', 'capture_screenshot', 'capture_debug_snapshot'].includes(name)) return response
    const item = response.content.find(item => item.type === 'text')
    if (item?.text) {
      try {
        const value = JSON.parse(item.text)
        value.timing = { ...measured, ...value.timing, total_ms: performance.now() - started }
        item.text = JSON.stringify(value)
      } catch { /* Non-JSON text responses retain their original content. */ }
    }
    return response
  }
  return withTiming(measured, async () => {
    try {
      if (!systemTraceToolNames.has(name)) validateExpectedState(name, args)
      const guarded = ['start_app', 'terminate_app', 'restart_app', 'reset_app_data', 'install_app', 'build_and_install', 'tap', 'tap_element', 'swipe', 'scroll_to_element', 'type_text', 'press_back', 'adjust_control', 'run_journey', 'wait_for_ui', 'wait_for_ui_change', 'wait_for_screen_change', 'expect_screen', 'expect_element_visible', 'expect_state'].includes(name)
      if (guarded && args.platform !== 'ios' && debuggerSessions.hasActiveSessions()) {
        const device = await resolveTargetDevice({ platform: 'android', deviceId: args.deviceId as string | undefined })
        return dispatchGuarded(device, args, handler, addTiming)
      }
      const response = await handler(args)
      attachPausedObservation(name, args, response)
      return addTiming(response)
    } catch (error) {
      if (error instanceof TraceError) return { ...wrapResponse({ error: { tool: name, code: error.code, message: error.message } }), isError: true }
      console.error(`Error executing tool ${name}:`, error)
      return addTiming(wrapToolError(name, error))
    }
  })
}
