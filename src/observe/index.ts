import { resolveTargetDevice } from '../utils/resolve-device.js'
import { AndroidObserve } from './android.js'
import { iOSObserve } from './ios.js'
import type {
  CaptureDebugSnapshotRawResponse,
  SnapshotSemanticResponse
} from '../types.js'
import { deriveSnapshotMetadata } from './snapshot-metadata.js'

export { AndroidObserve } from './android.js'
export { iOSObserve } from './ios.js'

interface SnapshotTreeElementLike {
  text?: string | null
  contentDescription?: string | null
  contentDesc?: string | null
  accessibilityLabel?: string | null
  resourceId?: string | null
  id?: string | null
  type?: string | null
  class?: string | null
  clickable?: boolean
  enabled?: boolean
  visible?: boolean
  state?: unknown
  stable_id?: string | null
  role?: string | null
  test_tag?: string | null
  selector?: unknown
  semantic?: unknown
}

interface SnapshotTreeLike {
  screen?: string | null
  elements?: SnapshotTreeElementLike[]
}

function normalizeHint(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase()
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function shortActivityName(activity: string | null | undefined): string | null {
  if (!activity) return null
  const trimmed = String(activity).trim()
  if (!trimmed) return null
  const lastSegment = trimmed.split('.').pop() || trimmed
  const withoutSuffix = lastSegment.replace(/Activity$/, '')
  return withoutSuffix ? titleCase(withoutSuffix) : titleCase(lastSegment)
}

function collectSnapshotTexts(tree: SnapshotTreeLike | null | undefined) {
  const elements = Array.isArray(tree?.elements) ? tree!.elements! : []
  const texts: string[] = []
  const actionables: string[] = []

  for (const element of elements) {
    const rawText = element?.text ?? element?.contentDescription ?? element?.contentDesc ?? element?.accessibilityLabel ?? element?.resourceId ?? element?.id ?? ''
    const text = normalizeHint(rawText)
    if (text) texts.push(text)
    if (element?.clickable && element?.enabled !== false && text) {
      actionables.push(text)
    }
  }

  return {
    texts: Array.from(new Set(texts)),
    actionables: Array.from(new Set(actionables))
  }
}

function inferSnapshotScreen(raw: CaptureDebugSnapshotRawResponse): string | null {
  const tree = raw.ui_tree as SnapshotTreeLike | null | undefined
  const treeScreen = normalizeHint(tree?.screen)
  if (treeScreen) return titleCase(treeScreen)

  const activity = shortActivityName(raw.activity)
  if (activity) return activity

  const { texts } = collectSnapshotTexts(tree)
  if (texts.length > 0) return titleCase(texts[0])

  return null
}

function deriveSnapshotSemantic(raw: CaptureDebugSnapshotRawResponse): SnapshotSemanticResponse | null {
  const tree = raw.ui_tree as SnapshotTreeLike | null | undefined
  const { texts, actionables } = collectSnapshotTexts(tree)
  const screenFromTree = normalizeHint(tree?.screen)
  const activityHint = normalizeHint(raw.activity)
  const screen = inferSnapshotScreen(raw)

  if (!screen && !activityHint && texts.length === 0 && !raw.logs.length) return null

  const hasErrorLogs = raw.logs.some((entry) => /error|fatal exception|exception|failed/i.test(entry.message))
  const hasLoadingSignals = texts.some((text) => /loading|please wait|spinner|progress/i.test(text))
  const hasPrimaryText = texts.some((text) => /sign in|log in|login|home|checkout|settings|menu|profile|search/i.test(text))
  const hasScreenshot = typeof raw.screenshot === 'string' && raw.screenshot.length > 0
  const hasUiTree = !!tree && Array.isArray(tree.elements)

  const signals: Record<string, string | number | boolean> = {
    has_activity: !!activityHint,
    has_ui_tree: hasUiTree,
    has_screenshot: hasScreenshot,
    has_visible_text: texts.length > 0,
    has_clickable_elements: actionables.length > 0,
    has_error_logs: hasErrorLogs,
    has_loading_signals: hasLoadingSignals,
    has_primary_text: hasPrimaryText
  }

  const warnings: string[] = []
  if (screenFromTree && activityHint && screenFromTree !== activityHint) {
    warnings.push('ui_tree.screen and activity hints differ')
  }
  if (!hasUiTree) warnings.push('ui tree unavailable')
  if (!activityHint) warnings.push('activity unavailable')
  if (hasErrorLogs) warnings.push('error signals present in logs')

  const evidenceScore =
    (hasUiTree ? 0.35 : 0) +
    (screen ? 0.2 : 0) +
    (activityHint ? 0.15 : 0) +
    (actionables.length > 0 ? 0.15 : 0) +
    (texts.length > 0 ? 0.1 : 0) +
    (hasScreenshot ? 0.05 : 0) +
    (hasErrorLogs ? -0.15 : 0) +
    (hasLoadingSignals ? -0.05 : 0)

  const confidence = Math.max(0, Math.min(1, Number(evidenceScore.toFixed(2))))

  if (!screen && confidence < 0.3) return null

  return {
    screen,
    signals,
    actions_available: actionables.length > 0 ? actionables.slice(0, 10) : null,
    confidence,
    warnings
  }
}

export class ToolsObserve {
  // Resolve a target device and return the appropriate observe instance and resolved info.
  private static async resolveObserve(platform?: 'android' | 'ios', deviceId?: string, appId?: string) {
    if (platform === 'android') {
      const resolved = await resolveTargetDevice({ platform: 'android', deviceId, appId })
      return { observe: new AndroidObserve(), resolved }
    }
    if (platform === 'ios') {
      const resolved = await resolveTargetDevice({ platform: 'ios', deviceId, appId })
      return { observe: new iOSObserve(), resolved }
    }

    // No platform specified: try android then ios
    try {
      const resolved = await resolveTargetDevice({ platform: 'android', deviceId, appId })
      return { observe: new AndroidObserve(), resolved }
    } catch {
      const resolved = await resolveTargetDevice({ platform: 'ios', deviceId, appId })
      return { observe: new iOSObserve(), resolved }
    }
  }

  static async getUITreeHandler({ platform, deviceId }: { platform?: 'android' | 'ios', deviceId?: string }) {
    const { observe, resolved } = await ToolsObserve.resolveObserve(platform, deviceId)
    return await observe.getUITree(resolved.id)
  }

  static async getCurrentScreenHandler({ deviceId }: { deviceId?: string }) {
    const { observe, resolved } = await ToolsObserve.resolveObserve('android', deviceId)
    // getCurrentScreen is Android-specific
    return await (observe as AndroidObserve).getCurrentScreen(resolved.id)
  }

  static async getLogsHandler({ platform, appId, deviceId, pid, tag, level, contains, since_seconds, limit, lines }: { platform?: 'android' | 'ios', appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number, lines?: number }) {
    const { observe, resolved } = await ToolsObserve.resolveObserve(platform, deviceId, appId)
    const filters = { appId, deviceId: resolved.id, pid, tag, level, contains, since_seconds, limit: limit ?? lines }

    // Validate filters
    if (level && !['VERBOSE','DEBUG','INFO','WARN','ERROR'].includes(level.toString().toUpperCase())) {
      return { device: resolved, logs: [], crashLines: [], logCount: 0, error: { code: 'INVALID_FILTER', message: `Unsupported level filter: ${level}` } } as any
    }

    if (observe instanceof AndroidObserve) {
      const response = await observe.getLogs(filters)
      const logs = Array.isArray(response.logs) ? response.logs : []
      const crashLines = logs.filter(entry => /FATAL EXCEPTION/i.test(entry.message))
      const anyFilterApplied = !!(appId || pid || tag || level || contains || since_seconds)
      if (anyFilterApplied && logs.length === 0) return { device: response.device, logs: [], crashLines: [], logCount: 0, source: response.source, meta: response.meta, error: { code: 'LOGS_UNAVAILABLE', message: 'No logs match filters' } } as any
      return { device: response.device, logs, crashLines, logCount: response.logCount, source: response.source, meta: response.meta }
    } else {
      const resp = await (observe as iOSObserve).getLogs(filters)
      const logs = Array.isArray(resp.logs) ? resp.logs : []
      const crashLines = logs.filter(entry => /FATAL EXCEPTION/i.test(entry.message))
      const anyFilterApplied = !!(appId || pid || tag || level || contains || since_seconds)
      if (anyFilterApplied && logs.length === 0) return { device: resp.device, logs: [], crashLines: [], logCount: 0, source: resp.source, meta: resp.meta, error: { code: 'LOGS_UNAVAILABLE', message: 'No logs match filters' } } as any
      return { device: resp.device, logs, crashLines, logCount: resp.logCount, source: resp.source, meta: resp.meta }
    }
  }

  static async startLogStreamHandler({ platform, packageName, level, sessionId, deviceId }: { platform?: 'android' | 'ios', packageName: string, level?: 'error' | 'warn' | 'info' | 'debug', sessionId?: string, deviceId?: string }) {
    const sid = sessionId || 'default'
    const { observe, resolved } = await ToolsObserve.resolveObserve(platform, deviceId, packageName)
    if (observe instanceof AndroidObserve) {
      return await observe.startLogStream(packageName, level || 'error', resolved.id, sid)
    } else {
      return await (observe as iOSObserve).startLogStream(packageName, resolved.id, sid)
    }
  }

  static async readLogStreamHandler({ platform, sessionId, limit, since }: { platform?: 'android' | 'ios', sessionId?: string, limit?: number, since?: string }) {
    const sid = sessionId || 'default'
    const { observe } = await ToolsObserve.resolveObserve(platform)
    return await (observe as any).readLogStream(sid, limit ?? 100, since)
  }

  static async stopLogStreamHandler({ platform, sessionId }: { platform?: 'android' | 'ios', sessionId?: string }) {
    const sid = sessionId || 'default'
    const { observe } = await ToolsObserve.resolveObserve(platform)
    return await (observe as any).stopLogStream(sid)
  }

  static async captureScreenshotHandler({ platform, deviceId }: { platform?: 'android' | 'ios', deviceId?: string }) {
    const { observe, resolved } = await ToolsObserve.resolveObserve(platform, deviceId)
    if (observe instanceof AndroidObserve) {
      return await observe.captureScreen(resolved.id)
    } else {
      return await (observe as iOSObserve).captureScreenshot(resolved.id)
    }
  }

  static async getScreenFingerprintHandler({ platform, deviceId }: { platform?: 'android' | 'ios', deviceId?: string } = {}) {
    const { observe, resolved } = await ToolsObserve.resolveObserve(platform, deviceId)
    // Both observes implement getScreenFingerprint
    return await (observe as any).getScreenFingerprint(resolved.id)
  }

  static async captureDebugSnapshotHandler({ reason, includeLogs = true, logLines = 200, platform, appId, deviceId, sessionId }: { reason?: string; includeLogs?: boolean; logLines?: number; platform?: 'android' | 'ios'; appId?: string; deviceId?: string; sessionId?: string } = {}) {
    const timestamp = Date.now()
    const raw: CaptureDebugSnapshotRawResponse = {
      timestamp,
      snapshot_revision: 0,
      captured_at_ms: timestamp,
      reason: reason || '',
      activity: null,
      fingerprint: null,
      screenshot: null,
      ui_tree: null,
      logs: []
    }

    // Parallel fetches for performance: screenshot, current screen, fingerprint, ui tree, and log stream/get logs
    const sid = sessionId || 'default'
    const tasks: Record<string, Promise<any>> = {
      screenshot: ToolsObserve.captureScreenshotHandler({ platform, deviceId }),
      currentScreen: (!platform || platform === 'android') ? ToolsObserve.getCurrentScreenHandler({ deviceId }) : Promise.resolve(null),
      fingerprint: ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }),
      uiTree: ToolsObserve.getUITreeHandler({ platform, deviceId }),
      readLogStream: includeLogs ? ToolsObserve.readLogStreamHandler({ platform, sessionId: sid, limit: logLines }) : Promise.resolve({ entries: [] }),
    }

    const results = await Promise.allSettled(Object.values(tasks))
    const keys = Object.keys(tasks)

    // Map results back to keys
    for (let i = 0; i < results.length; i++) {
      const key = keys[i]
      const res = results[i] as PromiseSettledResult<any>
      if (res.status === 'fulfilled') {
        const val = res.value
        if (key === 'screenshot') {
          raw.screenshot = val && val.screenshot ? val.screenshot : null
        } else if (key === 'currentScreen') {
          raw.activity = val && ((val.activity || val.shortActivity)) ? (val.activity || val.shortActivity) : raw.activity || ''
        } else if (key === 'fingerprint') {
          if (val && val.fingerprint) raw.fingerprint = val.fingerprint
          if (val && val.activity) raw.activity = raw.activity || val.activity
          if (val && val.error) raw.fingerprint_error = val.error
        } else if (key === 'uiTree') {
          raw.ui_tree = val
          if (val && val.error) raw.ui_tree_error = val.error
        } else if (key === 'readLogStream') {
          // handle below after evaluating fallback
          // temporarily attach to out._streamEntries
          raw.logs = Array.isArray(val?.entries) ? val.entries : []
        }
      } else {
        const errMsg = res.reason instanceof Error ? res.reason.message : String(res.reason)
        if (key === 'screenshot') raw.screenshot_error = errMsg
        if (key === 'currentScreen') raw.activity_error = errMsg
        if (key === 'fingerprint') { raw.fingerprint = null; raw.fingerprint_error = errMsg }
        if (key === 'uiTree') { raw.ui_tree = null; raw.ui_tree_error = errMsg }
        if (key === 'readLogStream') { raw.logs = []; raw.logs_error = errMsg }
      }
    }

    // Logs: prefer stream entries, fallback to snapshot logs when empty
    if (includeLogs) {
      try {
        let entries: any[] = Array.isArray(raw.logs) ? raw.logs : []
        if (!entries || entries.length === 0) {
          const gl = await ToolsObserve.getLogsHandler({ platform, appId, deviceId, lines: logLines })
          const snapshotLogs: any[] = (gl && (gl as any).logs) ? (gl as any).logs : []
          // raw may be structured entries or strings
          entries = snapshotLogs.slice(-Math.max(0, logLines)).map(item => {
            if (!item) return { timestamp: null, level: 'INFO', message: '' }
            if (typeof item === 'string') {
              const level = /\b(FATAL EXCEPTION|ERROR| E )\b/i.test(item) ? 'ERROR' : /\b(WARN| W )\b/i.test(item) ? 'WARN' : 'INFO'
              return { timestamp: null, level, message: item }
            }
            const msg = item.message || item.msg || JSON.stringify(item)
            const levelRaw = item.level || item.levelName || item._level || ''
            const level = (levelRaw && String(levelRaw)).toUpperCase() || (/\bERROR\b/i.test(msg) ? 'ERROR' : /\bWARN\b/i.test(msg) ? 'WARN' : 'INFO')
            const ts = item.timestamp || item._iso || null
            const tsNum = (ts && typeof ts === 'string') ? (isNaN(new Date(ts).getTime()) ? null : new Date(ts).getTime()) : (typeof ts === 'number' ? ts : null)
            return { timestamp: tsNum, level, message: msg }
          })
        } else {
          entries = entries.map(ent => {
            const msg = (ent && (ent.message || ent.msg)) ? (ent.message || ent.msg) : (typeof ent === 'string' ? ent : JSON.stringify(ent))
            const levelRaw = (ent && (ent.level || ent.levelName || ent._level)) ? (ent.level || ent.levelName || ent._level) : ''
            const level = (levelRaw && String(levelRaw)).toString().toUpperCase() || (/\bERROR\b/i.test(msg) ? 'ERROR' : /\bWARN\b/i.test(msg) ? 'WARN' : 'INFO')
            let tsNum: number | null = null
            const maybeIso = ent && ((ent._iso || ent.timestamp) as any)
            if (maybeIso && typeof maybeIso === 'string') {
              const d = new Date(maybeIso)
              if (!isNaN(d.getTime())) tsNum = d.getTime()
            }
            return { timestamp: tsNum, level, message: msg }
          })
        }

        raw.logs = entries
      } catch (e) {
        raw.logs = []
        raw.logs_error = e instanceof Error ? e.message : String(e)
      }
    }

    const snapshotDeviceKey = raw.ui_tree?.device
      ? `${raw.ui_tree.device.platform}:${raw.ui_tree.device.id}`
      : `${platform || 'unknown'}:${deviceId || 'default'}`
    const snapshotMetadata = deriveSnapshotMetadata(
      snapshotDeviceKey,
      raw.ui_tree,
      'snapshot',
      raw.ui_tree?.snapshot_revision ? null : (raw.fingerprint || raw.activity || null)
    )

    raw.snapshot_revision = raw.ui_tree?.snapshot_revision ?? snapshotMetadata.snapshot_revision
    raw.captured_at_ms = raw.ui_tree?.captured_at_ms ?? snapshotMetadata.captured_at_ms
    raw.loading_state = raw.ui_tree?.loading_state ?? snapshotMetadata.loading_state

    const semantic = deriveSnapshotSemantic(raw)
    return semantic ? { raw, semantic } : { raw }
  }
}
