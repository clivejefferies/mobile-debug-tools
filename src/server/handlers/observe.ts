

import { ToolsObserve } from '../../observe/index.js'
import { withObservationContext } from '../../observe/performance-metrics.js'
import {
  getBooleanArg,
  getNumberArg,
  getStringArg,
  requireStringArg,
  ToolCallArgs,
  wrapResponse
} from '../common.js'
import type { PlatformArg, ResponseMode } from './handler-types.js'

export async function handleGetLogs(args: ToolCallArgs) {
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

export async function handleCaptureScreenshot(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const started = performance.now()
  const res = await ToolsObserve.captureScreenshotHandler({ platform, deviceId })
  const screenshotMs = performance.now() - started
  const mime = res.screenshot_mime || 'image/png'
  const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [
    { type: 'text', text: JSON.stringify({ device: res.device, result: { resolution: res.resolution, mimeType: mime }, timing: { total_ms: screenshotMs, screenshot_ms: screenshotMs } }, null, 2) },
    { type: 'image', data: res.screenshot, mimeType: mime }
  ]
  if (res.screenshot_fallback) {
    content.push({ type: 'text', text: JSON.stringify({ note: 'JPEG fallback included for compatibility', mimeType: res.screenshot_fallback_mime || 'image/jpeg' }) })
    content.push({ type: 'image', data: res.screenshot_fallback, mimeType: res.screenshot_fallback_mime || 'image/jpeg' })
  }
  return { content }
}

export async function handleCaptureDebugSnapshot(args: ToolCallArgs) {
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

export async function handleGetUITree(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const responseMode = (getStringArg(args, 'responseMode') as ResponseMode | undefined) ?? 'debug'
  const sinceSnapshotRevision = getNumberArg(args, 'sinceSnapshotRevision')
  const metricsStepId = process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS === '1' ? getStringArg(args, '_metricsStepId') : undefined
  const res = await withObservationContext({ stepId: metricsStepId, purpose: metricsStepId?.includes('post-response') ? 'assertion' : 'debug' }, () =>
    ToolsObserve.getUITreeHandler({ platform, deviceId, responseMode, sinceSnapshotRevision }))
  return wrapResponse(res)
}

export async function handleGetCurrentScreen(args: ToolCallArgs) {
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.getCurrentScreenHandler({ deviceId })
  return wrapResponse(res)
}

export async function handleGetScreenFingerprint(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId })
  return wrapResponse(res)
}

export async function handleStartLogStream(args: ToolCallArgs) {
  const platform = (getStringArg(args, 'platform') as PlatformArg | undefined) ?? 'android'
  const packageName = requireStringArg(args, 'packageName')
  const level = (getStringArg(args, 'level') as 'error' | 'warn' | 'info' | 'debug' | undefined) ?? 'error'
  const sessionId = getStringArg(args, 'sessionId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsObserve.startLogStreamHandler({ platform, packageName, level, sessionId, deviceId })
  return wrapResponse(res)
}

export async function handleReadLogStream(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const sessionId = getStringArg(args, 'sessionId')
  const limit = getNumberArg(args, 'limit')
  const since = getStringArg(args, 'since')
  const res = await ToolsObserve.readLogStreamHandler({ platform, sessionId, limit, since })
  return wrapResponse(res)
}

export async function handleStopLogStream(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const sessionId = getStringArg(args, 'sessionId')
  const res = await ToolsObserve.stopLogStreamHandler({ platform, sessionId })
  return wrapResponse(res)
}

