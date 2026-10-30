import type { UiSelector as ExpectElementSelectorArg } from '../contracts/selector.js'
import { handleDebugger } from './debugger-handlers.js'
import { debuggerContracts } from './debugger-schema.js'
import { debuggerSessions } from '../debugger/sessions.js'
import { withDebuggerGuard, guardDispatched } from '../debugger/guard.js'
import { systemTraces, TraceError } from '../observe/system-trace.js'
import { systemTraceTools, traceTargetSchema, traceStartSchema, traceControlSchema } from './system-trace-schema.js'
import { currentEvidenceCorrelationId, bindSystemTrace, withEvidence, currentEvidenceActionId, validateActionRef, markEvidenceVerification, refreshJourneyEvidence, completeJourneyVerification } from '../observe/evidence.js'
import { measure, withTiming } from '../utils/timing.js'
import { randomUUID } from 'node:crypto'
import { runWithBudget } from '../utils/operation-budget.js'
import { journeySchema, tapElementControlsSchema } from './journey-schema.js'
import { readinessSchema, readinessWaitSchema } from './readiness-schema.js'
import { getAppReadiness, withReadyWait } from '../observe/readiness-service.js'
import { validateExpectedState } from './condition-schema.js'
import { conditionFailureCode, createConditionalAction, notifyActionStart, withConditionalAction } from '../interact/conditional-action.js'
import { resolveTargetDevice, withResolvedDevice } from '../utils/resolve-device.js'
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
import { recordObservationConsumer, recordObservationEvent, withObservationContext } from '../observe/performance-metrics.js'
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
  ToolCallResult,
  ToolHandler,
  wrapResponse,
  wrapToolError
} from './common.js'

const systemTraceToolNames = new Set(systemTraceTools.map(tool => tool.name))

type PlatformArg = 'android' | 'ios'
type ProjectTypeArg = 'native' | 'kmp' | 'react-native' | 'flutter'
type WaitForUiMatchArg = { index?: number }
type WaitForUiRetryArg = { max_attempts?: number, backoff_ms?: number }
type ScrollSelectorArg = { text?: string, resourceId?: string, contentDesc?: string, className?: string }
type ClassifyNetworkRequestArg = { endpoint: string, status: 'success' | 'failure' | 'retryable' }
type VerificationMode = 'none' | 'light' | 'full'
type ResponseMode = 'compact' | 'debug'

function interactionControls(args: ToolCallArgs) {
  const verificationMode = (getStringArg(args, 'verificationMode') as VerificationMode | undefined) ?? 'full'
  const responseMode = (getStringArg(args, 'responseMode') as ResponseMode | undefined) ?? 'debug'
  if (!['none', 'light', 'full'].includes(verificationMode) || !['compact', 'debug'].includes(responseMode)) throw new Error('INVALID_ARGUMENT')
  for (const key of ['verificationMode', 'responseMode']) if (args[key] !== undefined && typeof args[key] !== 'string') throw new Error('INVALID_ARGUMENT')
  for (const key of ['actionTimeoutMs', 'verificationTimeoutMs']) if (args[key] !== undefined && (typeof args[key] !== 'number' || !Number.isInteger(args[key]))) throw new Error('INVALID_ARGUMENT')
  const actionTimeoutMs = getNumberArg(args, 'actionTimeoutMs')
  const verificationTimeoutMs = getNumberArg(args, 'verificationTimeoutMs')
  return { verificationMode, responseMode,
    actionTimeoutMs: actionTimeoutMs === undefined ? undefined : Math.max(100, Math.min(30000, actionTimeoutMs)),
    verificationTimeoutMs: verificationTimeoutMs === undefined ? 3000 : Math.max(100, Math.min(60000, verificationTimeoutMs)) }

}

function compactAction(result: any, verificationMode: VerificationMode, started = true, stateDelta?: unknown, totalMs = 0) {
  return {
    action_id: result.action_id,
    action_type: result.action_type,
    success: !!result.success,
    lifecycle_state: result.success ? (verificationMode === 'full' ? result.lifecycle_state : 'pending_verification') : 'failed',
    ...(result.failure_code ? { failure_code: result.failure_code } : {}),
    ...(typeof result.retryable === 'boolean' ? { retryable: result.retryable } : {}),
    delivery_status: result.success ? 'delivered' : (started ? 'unknown' : 'not_delivered'),
    dispatch_started: started,
    verification: { mode: verificationMode, status: result.success ? (verificationMode === 'none' ? 'not_requested' : verificationMode === 'light' ? 'observed' : (result.lifecycle_state === 'verified' ? 'verified' : 'observed')) : 'failed' },
    ...(stateDelta ? { state_delta: stateDelta } : {}),
    timing: { total_ms: totalMs }
  }
}

function correlatedHandler(name: string, handler: ToolHandler, action = false, journey = false): ToolHandler {
  return async args => {
    const ref = validateActionRef(args.actionRef)
    const { result, evidence } = await withEvidence({ action, journey, ref }, async () => {
      try { return await handler(args) }
      catch (error) { return error instanceof TraceError ? { ...wrapResponse({ error: { tool: name, code: error.code, message: error.message } }), isError: true } : wrapToolError(name, error) }
    })
    const item = result.content.find(item => item.type === 'text')
    if (item?.text) {
      const payload = JSON.parse(item.text)
      payload.evidence = evidence
      item.text = JSON.stringify(payload)
    }
    return result
  }
}

function actionHandler(type: string, execute: ToolHandler): ToolHandler {
  return correlatedHandler(type, async (args) => {
    const timing: Record<string, number> = {}
    return withTiming(timing, async () => {
    const started = performance.now()
    const controls = interactionControls(args)
    const expected = validateExpectedState(type, args)
    const condition = expected ? createConditionalAction(args.platform as PlatformArg, args.deviceId as string, expected) : undefined
    const budgetMs = controls.actionTimeoutMs ?? ({ start_app: 10000, restart_app: 15000, scroll_to_element: 10000 }[type] ?? 5000)
    let dispatchStarted = false
    let result: any
    const dispatchWithBudget = (timeoutMs: number) => runWithBudget(timeoutMs, async (budget) => {
      try {
        if (!condition) return payloadOf(await execute(args))
        return await withConditionalAction(condition, async () => {
          const device = await resolveTargetDevice({ platform: condition.platform, deviceId: condition.deviceId })
          return withResolvedDevice(device, async () => payloadOf(await execute(args)))
        })
      }
      finally { dispatchStarted = budget.dispatchStarted }
    })
    try {
      // Omitted controls retain the existing adapter budgets.
      result = args._journey !== true && controls.verificationMode === 'full' && controls.responseMode === 'debug' && controls.actionTimeoutMs === undefined
        ? await dispatchWithBudget(Infinity) : await dispatchWithBudget(budgetMs)
      if (result.success) dispatchStarted = true
    } catch (error) {
      if (!condition && controls.verificationMode === 'full' && controls.responseMode === 'debug' && controls.actionTimeoutMs === undefined && !/TIMEOUT|timed out/i.test(String(error))) return wrapToolError(type, error)
      result = { success: false, failure_code: /TIMEOUT|timed out/i.test(String(error)) ? 'ACTION_TIMEOUT' : 'UNKNOWN', error: String(error) }
    }
    const blocked = condition && ['mismatch', 'unavailable'].includes(condition.result.status)
    if (blocked) {
      dispatchStarted = false
      result = buildActionExecutionResult({
        actionType: type, sourceModule: 'server', device: condition.result.observed?.device,
        selector: result?.target?.selector ?? null, resolved: result?.target?.resolved,
        success: false, uiFingerprintBefore: result?.ui_fingerprint_before ?? null, uiFingerprintAfter: null,
        failure: { failureCode: conditionFailureCode(condition), retryable: false },
        traceSteps: [{ stage: 'verify', timestamp: Date.now(), result: 'failure', attempt_index: 0, metadata: { phase: 'precondition', dispatch_started: false } }]
      })
    }
    if (result.failure_code === 'TIMEOUT' || /ACTION_TIMEOUT|timeout/i.test(result.error ?? result.reason ?? result.details?.error ?? '')) result.failure_code = 'ACTION_TIMEOUT'
    if (result.failure_code === 'ACTION_TIMEOUT') result.retryable = !dispatchStarted
    if (!result.success && typeof result.retryable !== 'boolean') result.retryable = !dispatchStarted
    result.action_id ??= currentEvidenceActionId() ?? randomUUID()
    result.action_type ??= type
    recordObservationEvent({
      step_id: args._stepId as string | undefined,
      action_type: type,
      dispatch_ms: timing.dispatch_ms,
      verification_mode: controls.verificationMode,
      dispatch_started: dispatchStarted
    })
    let delta: unknown
    let observationAvailable = false
    if (result.success && controls.verificationMode === 'light') {
      const verificationStarted = performance.now()
      const tree = await withObservationContext({ stepId: args._stepId as string | undefined, purpose: 'verification' }, () =>
        measure('post_observation_ms', () => runWithBudget(controls.verificationTimeoutMs, () =>
          ToolsObserve.getUITreeHandler({ platform: (args.platform as PlatformArg | undefined) ?? result.device?.platform, deviceId: (args.deviceId as string | undefined) ?? result.device?.id })))).catch(() => null) as any
      markEvidenceVerification()
      observationAvailable = !!tree && !tree.error
      recordObservationEvent({
        verification_budget_ms: controls.verificationTimeoutMs,
        verification_elapsed_ms: performance.now() - verificationStarted,
        verification_outcome: observationAvailable ? 'observed' : 'unavailable',
        verification_budget_expired: !observationAvailable && performance.now() - verificationStarted >= controls.verificationTimeoutMs
      })
      if (observationAvailable && tree.device) delta = ToolsObserve.getLatestStateDelta(tree.device.platform, tree.device.id) ?? undefined
    }
    if (!blocked && controls.verificationMode === 'full' && dispatchStarted) markEvidenceVerification()
    const compact = compactAction(result, controls.verificationMode, dispatchStarted, delta, performance.now() - started)
    if (blocked) compact.verification.status = 'not_requested'
    if (result.success && controls.verificationMode === 'light' && !observationAvailable) compact.verification.status = 'unavailable'
    const evidence = {
      ...compact,
      ...(condition ? { condition: controls.responseMode === 'compact' && condition.result.status === 'matched'
        ? { ...condition.result, observed: condition.result.observed ? {
          snapshot_session_id: condition.result.observed.snapshot_session_id,
          snapshot_revision: condition.result.observed.snapshot_revision,
          captured_at_ms: condition.result.observed.captured_at_ms
        } : null } : condition.result } : {}),
      ...(controls.verificationMode === 'light' ? { state_delta_available: !!delta } : {}),
      ...(result.success && controls.verificationMode === 'light' && !observationAvailable ? { verification_diagnostic: { code: 'VERIFICATION_UNAVAILABLE', retryable: true } } : {})
    }
    return wrapResponse(controls.responseMode === 'compact' ? evidence : {
      ...result, ...evidence, timing: { ...timing, total_ms: performance.now() - started },
      effective_controls: { ...controls, actionTimeoutMs: args._journey !== true && controls.verificationMode === 'full' && controls.responseMode === 'debug' && controls.actionTimeoutMs === undefined ? null : budgetMs, timeout_bound: !(args._journey !== true && controls.verificationMode === 'full' && controls.responseMode === 'debug' && controls.actionTimeoutMs === undefined) }
    }, controls.responseMode === 'debug')
    })
  }, true)
}
const handleStartApp = actionHandler('start_app', executeStartApp)
const handleRestartApp = actionHandler('restart_app', executeRestartApp)
const handleTap = actionHandler('tap', executeTap)
const handleTapElement = actionHandler('tap_element', executeTapElement)
const handleSwipe = actionHandler('swipe', executeSwipe)
const handleScrollToElement = actionHandler('scroll_to_element', executeScrollToElement)
const handleTypeText = actionHandler('type_text', executeTypeText)
const handlePressBack = actionHandler('press_back', executePressBack)

async function executeStartApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => (platform === 'android' ? new AndroidManage().startApp(appId, deviceId, actionTimeoutMs ?? (verificationMode === 'full' && getStringArg(args, 'responseMode') === undefined && args._journey !== true ? undefined : 10000)) : new iOSManage().startApp(appId, deviceId, verificationMode === 'full')))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'start_app',
    sourceModule: 'server',
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
      ...(res.diagnostics ? { diagnostics: res.diagnostics } : {}),
      ...(res.observedApp ? { observed_app: res.observedApp } : {})
    }
  })
  return wrapResponse(result)
}

async function handleTerminateApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await (platform === 'android' ? new AndroidManage().terminateApp(appId, deviceId) : new iOSManage().terminateApp(appId, deviceId))
  const response: TerminateAppResponse = { device: res.device, appTerminated: res.appTerminated }
  return wrapResponse(response)
}

async function executeRestartApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const bounded = args._journey === true || verificationMode !== 'full' || args.responseMode !== undefined || actionTimeoutMs !== undefined
  const res = await measure('dispatch_ms', () => (platform === 'android' ? new AndroidManage().restartApp(appId, deviceId, bounded, actionTimeoutMs ?? 15000) : new iOSManage().restartApp(appId, deviceId, verificationMode === 'full', bounded, actionTimeoutMs ?? 15000)))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'restart_app',
    sourceModule: 'server',
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
      ...(res.diagnostics ? { diagnostics: res.diagnostics } : {}),
      ...(res.observedApp ? { observed_app: res.observedApp } : {})
    }
  })
  return wrapResponse(result)
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
  const started = performance.now()
  const res = await ToolsObserve.captureScreenshotHandler({ platform, deviceId })
  const screenshotMs = performance.now() - started
  const mime = (res as any).screenshot_mime || 'image/png'
  const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [
    { type: 'text', text: JSON.stringify({ device: res.device, result: { resolution: (res as any).resolution, mimeType: mime }, timing: { total_ms: screenshotMs, screenshot_ms: screenshotMs } }, null, 2) },
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
  const includeScreenshot = getBooleanArg(args, 'includeScreenshot')
  const res = await ToolsObserve.captureDebugSnapshotHandler({ reason, includeLogs, includeScreenshot, logLines, platform, appId, deviceId, sessionId })
  return wrapResponse(res)
}

async function handleGetUITree(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const responseMode = (getStringArg(args, 'responseMode') as ResponseMode | undefined) ?? 'debug'
  const sinceSnapshotRevision = getNumberArg(args, 'sinceSnapshotRevision')
  const metricsStepId = process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS === '1' ? getStringArg(args, '_metricsStepId') : undefined
  const res = await withObservationContext({ stepId: metricsStepId, purpose: metricsStepId?.includes('post-response') ? 'assertion' : 'debug' }, () =>
    ToolsObserve.getUITreeHandler({ platform, deviceId, responseMode, sinceSnapshotRevision }))
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

async function handleAdjustControl(args: ToolCallArgs) {
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

async function handleWaitForUI(args: ToolCallArgs) {
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

async function handleWaitForUIChange(args: ToolCallArgs) {
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

async function handleFindElement(args: ToolCallArgs) {
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

async function executeTap(args: ToolCallArgs) {
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
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  })
  return wrapResponse(result)
}

async function executeTapElement(args: ToolCallArgs) {
  const controls = tapElementControlsSchema.safeParse({ elementId: args.elementId, selector: args.selector, waitFor: args.waitFor })
  if (!controls.success) throw new Error(`INVALID_ARGUMENT: ${controls.error.message}`)
  const elementId = controls.data.elementId
  const selector = controls.data.selector as ExpectElementSelectorArg | undefined
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  let resolvedId = elementId
  let freshTree: any
  if (selector) {
    const waitFor = getObjectArg<WaitForUiMatchArg>(args, 'waitFor') as any
    const targetStarted = performance.now()
    const resolutionTimeoutMs = waitFor?.timeoutMs ?? actionTimeoutMs ?? 5000
    const resolution = await withObservationContext({ stepId: args._stepId as string | undefined, purpose: 'target' }, () =>
      measure('target_resolution_ms', () => runWithBudget(resolutionTimeoutMs, () => ToolsInteract.waitForUIHandler({ selector, condition: waitFor?.condition ?? 'clickable', timeout_ms: resolutionTimeoutMs, poll_interval_ms: waitFor?.pollIntervalMs ?? 100, match: waitFor?.match, singleObservation: true, singleAttempt: !waitFor, rejectAmbiguous: !waitFor, resolveTapTarget: true, platform: getStringArg(args, 'platform') as PlatformArg | undefined, deviceId: getStringArg(args, 'deviceId') })))) as any
    recordObservationEvent({ step_id: args._stepId as string | undefined, purpose: 'target', target_resolution_ms: performance.now() - targetStarted, target_resolution_outcome: resolution.status })
    if (resolution.status !== 'success' || !resolution.element?.elementId) return wrapResponse({ success: false, action_type: 'tap_element', failure_code: resolution.error?.code ?? 'ELEMENT_NOT_FOUND', retryable: true })
    resolvedId = resolution.element.elementId
    freshTree = resolution._tree
  }
  notifyActionStart()
  if (freshTree) recordObservationConsumer(freshTree, 'target', args._stepId as string | undefined)
  const res = await measure('dispatch_ms', () => ToolsInteract.tapElementHandler({ elementId: resolvedId!, freshTree, verificationMode, timeoutMs: actionTimeoutMs, platform: getStringArg(args, 'platform') as PlatformArg | undefined, deviceId: getStringArg(args, 'deviceId') })) as any
  return wrapResponse(res)
}

function payloadOf(response: ToolCallResult) {
  const text = response.content.find((item: any) => item.type === 'text')?.text
  return text ? JSON.parse(text) : null
}

async function expectElementAbsent({ selector, timeoutMs, pollIntervalMs, platform, deviceId }: { selector: ExpectElementSelectorArg, timeoutMs: number, pollIntervalMs: number, platform: PlatformArg, deviceId?: string }) {
  const deadline = performance.now() + timeoutMs
  let consecutive = 0
  let observed: unknown
  while (performance.now() < deadline) {
    const result = await ToolsInteract.waitForUIHandler({ selector, condition: 'not_exists', timeout_ms: 0, singleObservation: true, singleAttempt: true, platform, deviceId }) as any
    observed = result.observed
    consecutive = result.status === 'success' ? consecutive + 1 : 0
    if (consecutive === 2 && performance.now() <= deadline) return { success: true, observed }
    const delay = Math.max(100, pollIntervalMs)
    if (performance.now() + delay >= deadline) break
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  return { success: false, failure_code: 'ASSERTION_TIMEOUT', observed }
}

async function expectFingerprint({ fingerprint, timeoutMs, platform, deviceId }: { fingerprint: string, timeoutMs: number, platform: PlatformArg, deviceId?: string }) {
  const deadline = performance.now() + timeoutMs
  let consecutive = 0
  let observed: string | null = null
  while (performance.now() < deadline) {
    const result = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as any
    observed = result?.fingerprint ?? null
    consecutive = observed === fingerprint ? consecutive + 1 : 0
    if (consecutive === 2 && performance.now() <= deadline) return { success: true, observed_fingerprint: observed }
    if (performance.now() + 100 >= deadline) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return { success: false, failure_code: 'ASSERTION_TIMEOUT', observed_fingerprint: observed }
}

async function handleRunJourney(args: ToolCallArgs) {
  const parsed = journeySchema.safeParse(args)
  if (!parsed.success) throw new Error(`INVALID_ARGUMENT: ${parsed.error.message}`)
  const { platform, responseMode, defaults, captureOnFailure } = parsed.data
  const steps = parsed.data.steps as Array<Record<string, any>>
  const device = await resolveTargetDevice({ platform, deviceId: parsed.data.deviceId })
  const deviceId = device.id
  const finishTrace = parsed.data.systemTraceId
    ? await systemTraces.link(parsed.data.systemTraceId, device, currentEvidenceCorrelationId()!) : undefined
  if (parsed.data.systemTraceId) bindSystemTrace(parsed.data.systemTraceId)
  try {
  return await withResolvedDevice(device, async () => {
  const started = performance.now()
  const results: any[] = []
  let stoppedAt: string | null = null
  let pendingLightStep: number | null = null
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    if (platform === 'android' && debuggerSessions.paused(deviceId)) {
      results.push({ id: step.id, type: step.type, status: 'failed', success: false, result: { success: false, failure_code: 'DEBUGGER_PAUSED', dispatch_started: false, delivery_status: 'not_delivered' } })
      stoppedAt = step.id as string
      break
    }
    const requestedVerification = step.verificationMode ?? defaults?.verificationMode ?? 'full'
    const next = steps[index + 1]
    const lightCoveredByAssertion = step.type === 'tap' && responseMode === 'compact' && requestedVerification === 'light' && next?.type === 'assert' &&
      next.assertion?.kind === 'element_visible'
    const stepStart = performance.now()
    let result: any
    if (stoppedAt) {
      results.push({ id: step.id, type: step.type, status: 'not_run', success: false, reason: 'PREVIOUS_STEP_FAILED', result: null, timing: { total_ms: 0 } })
      continue
    }
    try {
    if (step.type === 'tap') {
      result = payloadOf(await handleTapElement({ ...defaults, ...step, platform, deviceId, responseMode, _journey: true, _stepId: step.id, verificationMode: lightCoveredByAssertion ? 'none' : requestedVerification }))
    } else if (step.type === 'wait') {
      result = await withObservationContext({ stepId: step.id, purpose: 'target' }, () => ToolsInteract.waitForUIHandler({ selector: step.selector as ExpectElementSelectorArg, condition: (step.condition as any) ?? 'exists', timeout_ms: (step.timeoutMs as number | undefined) ?? 5000, poll_interval_ms: (step.pollIntervalMs as number | undefined) ?? 100, platform, deviceId }))
      result = { success: result.status === 'success', ...result }
    } else if (step.type === 'assert') {
      result = await withObservationContext({ stepId: step.id, purpose: 'assertion' }, () => runWithBudget((step.timeoutMs as number | undefined) ?? 5000, async () => {
      const assertion = step.assertion as any
      if (assertion?.kind === 'element_visible') result = await ToolsInteract.expectElementVisibleHandler({ selector: assertion.selector, timeout_ms: (step.timeoutMs as number | undefined) ?? 5000, poll_interval_ms: (step.pollIntervalMs as number | undefined) ?? 100, platform, deviceId })
      else if (assertion?.kind === 'element_absent') result = await expectElementAbsent({ selector: assertion.selector, timeoutMs: (step.timeoutMs as number | undefined) ?? 5000, pollIntervalMs: (step.pollIntervalMs as number | undefined) ?? 100, platform, deviceId })
      else if (assertion?.kind === 'screen_fingerprint') result = await expectFingerprint({ fingerprint: assertion.fingerprint, timeoutMs: (step.timeoutMs as number | undefined) ?? 5000, platform, deviceId })
      else if (assertion?.kind === 'state_equals') result = await ToolsInteract.expectStateHandler({ selector: assertion.selector, element_id: assertion.elementId, property: assertion.property, expected: assertion.expected, platform, deviceId, stabilization_window_ms: step.timeoutMs ?? 5000, poll_interval_ms: step.pollIntervalMs ?? 100, exact_budget: true })
      else result = { success: false, failure_code: 'INVALID_ASSERTION' }
      return result
      }))
    } else if (step.type === 'start_app') {
      result = payloadOf(await handleStartApp({ ...defaults, platform, deviceId, appId: step.appId, responseMode, _journey: true, _stepId: step.id, verificationMode: step.verificationMode ?? defaults?.verificationMode ?? 'full' }))
    } else {
      result = { success: false, failure_code: 'UNSUPPORTED_JOURNEY_STEP' }
    }
    } catch (error) {
      result = { success: false, failure_code: step.type === 'assert' ? 'ASSERTION_TIMEOUT' : 'STEP_FAILED', error: error instanceof Error ? error.message : String(error) }
    }
    if (platform === 'android' && debuggerSessions.paused(deviceId)) { result.success = false; result.failure_code = 'DEBUGGER_PAUSED'; result.retryable = false }
    if (step.type === 'assert' && !result?.success && /TIMEOUT/.test(result?.failure_code ?? '')) result.failure_code = 'ASSERTION_TIMEOUT'
    const success = !!result?.success
    if (lightCoveredByAssertion) {
      result.verification = { mode: 'light', status: success ? 'unavailable' :
        (['mismatch', 'unavailable'].includes(result.condition?.status) ? 'not_requested' : 'failed') }
      if (success) {
        result.verification_diagnostic = { code: 'VERIFICATION_UNAVAILABLE', retryable: true }
        pendingLightStep = results.length
      }
    }
    if (step.type === 'assert' && pendingLightStep !== null) {
      const pending = results[pendingLightStep].result
      if (typeof result?.observed?.matched_count === 'number') {
        pending.verification.status = 'observed'
        if (pending.evidence) completeJourneyVerification(pending.evidence.action_id)
        delete pending.verification_diagnostic
        const delta = ToolsObserve.getLatestStateDelta(platform, deviceId)
        if (delta) { pending.state_delta = delta; pending.state_delta_available = true }
      }
      pendingLightStep = null
    }
    if (responseMode === 'compact' && ['wait', 'assert'].includes(step.type)) result = {
      success, ...(result.failure_code ? { failure_code: result.failure_code } : {}),
      ...(result.error?.code ? { failure_code: result.error.code } : {}),
      ...(result.observed?.matched_count !== undefined ? { matched_count: result.observed.matched_count } : {}),
      ...(result.observed_fingerprint !== undefined ? { matched: success } : {}),
      ...(result.actual_state ? { observed: result.actual_state } : {})
    }
    results.push({ id: step.id, type: step.type, status: success ? 'passed' : 'failed', success, result, timing: { total_ms: performance.now() - stepStart } })
    if (!success) stoppedAt = step.id as string
  }
  const failureSnapshot = stoppedAt && captureOnFailure && responseMode === 'debug'
    ? await ToolsObserve.captureDebugSnapshotHandler({ platform, deviceId, includeScreenshot: false }).catch(() => null) : undefined
  const componentTiming: Record<string, number> = {}
  for (const step of results) for (const [key, value] of Object.entries(step.result?.timing ?? {})) {
    if (key !== 'total_ms' && typeof value === 'number') componentTiming[key] = (componentTiming[key] ?? 0) + value
  }
  refreshJourneyEvidence(results)
  return wrapResponse({ ...(finishTrace ? { system_trace: await finishTrace() } : {}), success: stoppedAt === null, stopped_at_step_id: stoppedAt, steps: results, ...(failureSnapshot ? { failure_snapshot: failureSnapshot } : {}), timing: responseMode === 'compact' ? { total_ms: performance.now() - started } : { ...componentTiming, total_ms: performance.now() - started } }, responseMode === 'debug')
  })
  } finally { await finishTrace?.() }
}

async function executeSwipe(args: ToolCallArgs) {
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
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  })
  return wrapResponse(result)
}

async function executeScrollToElement(args: ToolCallArgs) {
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
  })
  return wrapResponse(result)
}

async function executeTypeText(args: ToolCallArgs) {
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
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  })
  return wrapResponse(result)
}

async function executePressBack(args: ToolCallArgs) {
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
    failure: res.success ? undefined : inferGenericFailure((res as any).error)
  })
  return wrapResponse(result)
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
  const actionType = getStringArg(args, 'actionType')
  const networkRequests = getArrayArg<ClassifyNetworkRequestArg>(args, 'networkRequests')
  const hasLogErrors = getBooleanArg(args, 'hasLogErrors')
  const result = classifyActionOutcome({
    uiChanged,
    expectedElementVisible: expectedElementVisible ?? null,
    actionType: actionType ?? null,
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

async function handleSystemTrace(name: string, args: ToolCallArgs) {
  const schema = name === 'start_system_trace' ? traceStartSchema : name === 'get_system_trace_capabilities' ? traceTargetSchema : traceControlSchema
  const parsed = schema.safeParse(args)
  if (!parsed.success) throw new TraceError('INVALID_ARGUMENT')
  if (name === 'get_system_trace_capabilities' || name === 'start_system_trace') {
    const target = parsed.data as { platform: PlatformArg; deviceId?: string; durationMs?: number }
    if (target.platform !== 'android') {
      if (name === 'start_system_trace') throw new TraceError('UNSUPPORTED_PLATFORM')
      return wrapResponse({ supported: false, backend: 'perfetto', device: null, prerequisites: {}, reasons: ['UNSUPPORTED_PLATFORM'], enabled_sources: [], unavailable_categories: [], limitations: ['Android only'] })
    }
    let device
    try { device = await resolveTargetDevice(target) }
    catch {
      if (name === 'start_system_trace') throw new TraceError('TRACE_UNSUPPORTED')
      return wrapResponse({ supported: false, backend: 'perfetto', device: null, prerequisites: { device: false }, reasons: ['DEVICE_UNAVAILABLE'], enabled_sources: [], unavailable_categories: [], limitations: ['An authorised Android device is required'] })
    }
    if (name === 'get_system_trace_capabilities') return wrapResponse(await systemTraces.capabilities(device.id))
    const result = await systemTraces.start(device.id, target.durationMs)
    return { ...wrapResponse(result), ...(result.state === 'failed' ? { isError: true } : {}) }
  }
  const operation = name === 'stop_system_trace' ? 'stop' : name === 'cancel_system_trace' ? 'cancel' : 'status'
  const result = await systemTraces.control((parsed.data as { traceId: string }).traceId, operation)
  return { ...wrapResponse(result), ...(['failed', 'cancelled'].includes(result.state) ? { isError: true } : {}) }
}

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
      const response = await handler(args)
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
      return addTiming(response)
    } catch (error) {
      if (error instanceof TraceError) return { ...wrapResponse({ error: { tool: name, code: error.code, message: error.message } }), isError: true }
      console.error(`Error executing tool ${name}:`, error)
      return addTiming(wrapToolError(name, error))
    }
  })
}
