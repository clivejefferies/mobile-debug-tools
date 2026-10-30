import type { CaptureDebugSnapshotRawResponse } from '../types.js'
import type { ToolsObserve } from './index.js'
import { omitEvidence } from './evidence.js'
import { measure } from '../utils/timing.js'
import { deriveSnapshotMetadata } from './snapshot-metadata.js'
import { deriveSnapshotSemantic } from './snapshot-semantic.js'
import { snapshotLog, streamLog, type SnapshotLogEntry } from './snapshot-logs.js'
export interface SnapshotInput { reason?: string; includeLogs?: boolean; includeScreenshot?: boolean; logLines?: number; platform?: 'android' | 'ios'; appId?: string; deviceId?: string; sessionId?: string }
type Dependencies = Pick<typeof ToolsObserve, 'captureScreenshotHandler' | 'getCurrentScreenHandler' | 'getScreenFingerprintHandler' | 'getUITreeHandler' | 'readLogStreamHandler' | 'getLogsHandler'>
async function settle<T extends Record<string, Promise<unknown>>>(tasks: T) {
  const results = await Promise.allSettled(Object.values(tasks))
  return Object.fromEntries(Object.keys(tasks).map((key, index) => [key, results[index]])) as { [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }
}
function apply<T>(result: PromiseSettledResult<T>, success: (value: T) => void, failure: (message: string) => void) {
  if (result.status === 'fulfilled') success(result.value)
  else failure(result.reason instanceof Error ? result.reason.message : String(result.reason))
}
async function collect(raw: CaptureDebugSnapshotRawResponse, input: SnapshotInput, deps: Dependencies) {
  const { platform, deviceId, includeScreenshot = true, includeLogs = true, sessionId, logLines = 200 } = input
  const results = await settle({
    screenshot: includeScreenshot ? measure('screenshot_ms', () => deps.captureScreenshotHandler({ platform, deviceId })) : Promise.resolve(null),
    currentScreen: !platform || platform === 'android' ? deps.getCurrentScreenHandler({ deviceId }) : Promise.resolve(null),
    fingerprint: deps.getScreenFingerprintHandler({ platform, deviceId }),
    uiTree: deps.getUITreeHandler({ platform, deviceId }),
    readLogStream: includeLogs ? deps.readLogStreamHandler({ platform, deviceId, sessionId: sessionId || 'default', limit: logLines }) : Promise.resolve({ entries: [] })
  })
  let entries: unknown[] = []
  apply(results.screenshot, value => { raw.screenshot = value && value.screenshot ? value.screenshot : null }, error => { raw.screenshot_error = error })
  apply(results.currentScreen, value => { raw.activity = value && (value.activity || value.shortActivity) ? value.activity || value.shortActivity : raw.activity || '' }, error => { raw.activity_error = error })
  apply(results.fingerprint, value => {
    if (value && value.fingerprint) raw.fingerprint = value.fingerprint
    if (value && value.activity) raw.activity = raw.activity || value.activity
    if (value && value.error) raw.fingerprint_error = value.error
  }, error => { raw.fingerprint = null; raw.fingerprint_error = error })
  apply(results.uiTree, value => { raw.ui_tree = value; if (value && value.error) raw.ui_tree_error = value.error }, error => { raw.ui_tree = null; raw.ui_tree_error = error })
  apply(results.readLogStream, value => { entries = Array.isArray(value?.entries) ? value.entries : [] }, error => { raw.logs_error = error })
  return entries
}
async function collectLogs(entries: unknown[], input: SnapshotInput, deps: Dependencies): Promise<SnapshotLogEntry[]> {
  if (entries.length) return entries.map(streamLog)
  const { platform, appId, deviceId, logLines = 200 } = input
  const response = await deps.getLogsHandler({ platform, appId, deviceId, lines: logLines })
  return (response && response.logs ? response.logs : []).slice(-Math.max(0, logLines)).map(snapshotLog)
}
function metadata(raw: CaptureDebugSnapshotRawResponse, input: SnapshotInput) {
  const key = raw.ui_tree?.device ? `${raw.ui_tree.device.platform}:${raw.ui_tree.device.id}` : `${input.platform || 'unknown'}:${input.deviceId || 'default'}`
  const value = deriveSnapshotMetadata(key, raw.ui_tree, 'snapshot', raw.ui_tree?.snapshot_revision ? null : raw.fingerprint || raw.activity || null)
  raw.snapshot_revision = raw.ui_tree?.snapshot_revision ?? value.snapshot_revision
  raw.captured_at_ms = raw.ui_tree?.captured_at_ms ?? value.captured_at_ms
  raw.snapshot_delta = raw.ui_tree?.snapshot_delta ?? value.snapshot_delta ?? null
  raw.loading_state = raw.ui_tree?.loading_state ?? value.loading_state
}
export async function collectDebugSnapshot(input: SnapshotInput = {}, deps: Dependencies) {
  if (input.includeScreenshot === false) omitEvidence('screenshot')
  if (input.includeLogs === false) omitEvidence('logs')
  const timestamp = Date.now()
  const raw: CaptureDebugSnapshotRawResponse = {
    timestamp, snapshot_revision: 0, captured_at_ms: timestamp,
    reason: input.reason || '', activity: null, fingerprint: null, screenshot: null, ui_tree: null, logs: []
  }
  const entries = await collect(raw, input, deps)
  if (input.includeLogs !== false) {
    try { raw.logs = await collectLogs(entries, input, deps) }
    catch (error) { raw.logs = []; raw.logs_error = error instanceof Error ? error.message : String(error) }
  }
  metadata(raw, input)
  const semantic = deriveSnapshotSemantic(raw)
  return semantic ? { raw, semantic } : { raw }
}
