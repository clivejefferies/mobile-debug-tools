import { captureEvidence } from './evidence.js'
import { GetLogsResponse, CaptureIOSScreenshotResponse, GetUITreeResponse, DeviceInfo } from "../types.js"
import { getIOSDeviceMetadata } from "../utils/ios/utils.js"
import { iosActiveLogStreams } from './ios/context.js'
import { collectGetUITree } from './ios/ui-tree.js'
import { collectGetLogs } from './ios/logs.js'
import { collectCaptureScreenshot } from './ios/screenshot.js'
import { collectGetScreenFingerprint } from './ios/fingerprint.js'
import { startLogStream, stopLogStream, readLogStream, collectReadLogStream } from './ios/log-stream.js'
export { traverseIDBNode } from './ios/ui-elements.js'
export { _setIOSExecCommandForTests, _resetIOSExecCommandForTests, _setIOSActiveLogStream, _clearIOSActiveLogStream } from './ios/context.js'

export class iOSObserve {
  getLogStreamDevice(sessionId: string = 'default') { return iosActiveLogStreams.get(sessionId)?.device ?? null }

  async getDeviceMetadata(deviceId: string = "booted"): Promise<DeviceInfo> {
    return getIOSDeviceMetadata(deviceId);
  }

  async getLogs(filters: { appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number } = {}): Promise<GetLogsResponse> {
    return captureEvidence('logs', { platform: 'ios', id: filters.deviceId ?? '' }, () => this.collectGetLogs(filters))
  }

  private async collectGetLogs(filters: { appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number } = {}): Promise<GetLogsResponse> { return collectGetLogs(filters) }

  async captureScreenshot(deviceId: string = "booted"): Promise<CaptureIOSScreenshotResponse> {
    return captureEvidence('screenshot', { platform: 'ios', id: deviceId ?? '' }, () => this.collectCaptureScreenshot(deviceId))
  }

  private async collectCaptureScreenshot(deviceId: string = "booted"): Promise<CaptureIOSScreenshotResponse> { return collectCaptureScreenshot(deviceId) }

  async getUITree(deviceId: string = "booted"): Promise<GetUITreeResponse> {
    return captureEvidence('ui_tree', { platform: 'ios', id: deviceId ?? '' }, () => this.collectGetUITree(deviceId))
  }

  private async collectGetUITree(deviceId: string = "booted"): Promise<GetUITreeResponse> { return collectGetUITree(deviceId) }

  async getScreenFingerprint(deviceId: string = 'booted'): Promise<{ fingerprint: string | null; activity?: string; error?: string; captured_at_ms?: number }> {
    return captureEvidence('fingerprint', { platform: 'ios', id: deviceId ?? '' }, () => this.collectGetScreenFingerprint(deviceId))
  }

  private async collectGetScreenFingerprint(deviceId: string = 'booted'): Promise<{ fingerprint: string | null; activity?: string; error?: string; captured_at_ms?: number }> { return collectGetScreenFingerprint(this, deviceId) }

  async startLogStream(bundleId: string, deviceId: string = 'booted', sessionId: string = 'default'): Promise<{ success: boolean; stream_started?: boolean; error?: string }> { return startLogStream(bundleId, deviceId, sessionId) }

  async stopLogStream(sessionId: string = 'default'): Promise<{ success: boolean }> { return stopLogStream(sessionId) }

  async readLogStream(sessionId: string = 'default', limit: number = 100, since?: string): Promise<{ entries: import('./logs/model.js').StreamLogEntry[], crash_summary?: { crash_detected: boolean, exception?: string, sample?: string } }> { return readLogStream(sessionId, limit, since) }

  private async collectReadLogStream(sessionId: string = 'default', limit: number = 100, since?: string): Promise<{ entries: import('./logs/model.js').StreamLogEntry[], crash_summary?: { crash_detected: boolean, exception?: string, sample?: string } }> { return collectReadLogStream(sessionId, limit, since) }
}
