import type { GetUITreeResponse, StateDelta } from '../types.js'
import { withResolvedDevice } from '../utils/resolve-device.js'
import { ReadinessTracker } from './readiness.js'
import { resolveTargetDevice } from '../utils/resolve-device.js'
import { AndroidObserve } from './android.js'
import { iOSObserve } from './ios.js'

import { getLatestStateDelta, getStateDelta } from './snapshot-metadata.js'

export { AndroidObserve } from './android.js'
export { iOSObserve } from './ios.js'

import { collectDebugSnapshot } from './snapshot-collection.js'
interface TreeInput { platform?: 'android' | 'ios'; deviceId?: string; responseMode?: 'compact' | 'debug'; sinceSnapshotRevision?: number }
interface CompactTree extends Partial<GetUITreeResponse> { delta_available: boolean; state_delta?: StateDelta; reason?: string }

export class ToolsObserve {
  static getLatestStateDelta(platform: 'android' | 'ios', deviceId: string) {
    return getLatestStateDelta(`${platform}:${deviceId}`)
  }
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

  static getUITreeHandler(input: TreeInput & { responseMode?: 'debug' }): Promise<GetUITreeResponse>
  static getUITreeHandler(input: TreeInput): Promise<GetUITreeResponse | CompactTree>
  static async getUITreeHandler({ platform, deviceId, responseMode = 'debug', sinceSnapshotRevision }: { platform?: 'android' | 'ios', deviceId?: string, responseMode?: 'compact' | 'debug', sinceSnapshotRevision?: number }) {
    const { observe, resolved } = await ToolsObserve.resolveObserve(platform, deviceId)
    const acquisitionStarted = Date.now()
    const tree = await observe.getUITree(resolved.id)
    tree.readiness = new ReadinessTracker(resolved.platform, resolved.id).observe(tree, acquisitionStarted)
    if (responseMode !== 'compact') return tree
    const revision = tree?.snapshot_revision ?? null
    const session = { snapshot_session_id: tree?.snapshot_session_id, readiness: tree.readiness }
    if (tree?.error) return { ...session, delta_available: false, snapshot_revision: revision, error: tree.error }
    const baseRevision = sinceSnapshotRevision
    if (!Number.isInteger(baseRevision) || revision === null) {
      return { ...session, delta_available: false, snapshot_revision: revision }
    }
    const delta = getStateDelta(`${resolved.platform}:${resolved.id}`, baseRevision as number, revision)
    return delta ? { ...session, delta_available: true, state_delta: delta, snapshot_revision: revision } : {
      ...session,
      delta_available: false,
      snapshot_revision: revision,
      reason: 'BASE_REVISION_UNAVAILABLE'
    }
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
    if (level && !['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level.toString().toUpperCase())) {
      return { device: resolved, logs: [], crashLines: [], logCount: 0, error: { code: 'INVALID_FILTER', message: `Unsupported level filter: ${level}` } }
    }

    const response = await observe.getLogs(filters)
    const logs = Array.isArray(response.logs) ? response.logs : []
    const crashLines = logs.filter(entry => /FATAL EXCEPTION/i.test(entry.message))
    const anyFilterApplied = !!(appId || pid || tag || level || contains || since_seconds)
    if (anyFilterApplied && logs.length === 0) return { device: response.device, logs: [], crashLines: [], logCount: 0, source: response.source, meta: response.meta, error: { code: 'LOGS_UNAVAILABLE', message: 'No logs match filters' } }
    return { device: response.device, logs, crashLines, logCount: response.logCount, source: response.source, meta: response.meta }
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

  static async readLogStreamHandler({ platform, sessionId, limit, since, deviceId }: { deviceId?: string, platform?: 'android' | 'ios', sessionId?: string, limit?: number, since?: string }) {
    const sid = sessionId || 'default'
    const android = new AndroidObserve()
    const ios = new iOSObserve()
    const observe = platform === 'android' ? android : platform === 'ios' ? ios :
      ios.getLogStreamDevice(sid) && !android.getLogStreamDevice(sid) ? ios : android
    const streamDevice = observe.getLogStreamDevice(sid)
    if (deviceId && streamDevice && streamDevice.id !== deviceId) throw new Error('LOG_STREAM_DEVICE_MISMATCH')
    return await observe.readLogStream(sid, limit ?? 100, since)
  }

  static async stopLogStreamHandler({ platform, sessionId }: { platform?: 'android' | 'ios', sessionId?: string }) {
    const sid = sessionId || 'default'
    const android = new AndroidObserve()
    const ios = new iOSObserve()
    const observe = platform === 'android' ? android : platform === 'ios' ? ios :
      ios.getLogStreamDevice(sid) && !android.getLogStreamDevice(sid) ? ios : android
    return await observe.stopLogStream(sid)
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
    return await (observe).getScreenFingerprint(resolved.id)
  }

  static async captureDebugSnapshotHandler({ reason, includeLogs = true, includeScreenshot = true, logLines = 200, platform, appId, deviceId, sessionId }: { reason?: string; includeLogs?: boolean; includeScreenshot?: boolean; logLines?: number; platform?: 'android' | 'ios'; appId?: string; deviceId?: string; sessionId?: string } = {}) {
    const { resolved } = await ToolsObserve.resolveObserve(platform, deviceId, appId)
    return withResolvedDevice(resolved, () => ToolsObserve.collectDebugSnapshot({
      reason, includeLogs, includeScreenshot, logLines,
      platform: resolved.platform as 'android' | 'ios', appId, deviceId: resolved.id, sessionId
    }))
  }

  private static collectDebugSnapshot(input: import('./snapshot-collection.js').SnapshotInput = {}) {
    return collectDebugSnapshot(input, ToolsObserve)
  }
}
