import { captureEvidence } from './evidence.js'
import { GetLogsResponse, CaptureAndroidScreenResponse, GetUITreeResponse, GetCurrentScreenResponse, DeviceInfo } from "../types.js"
import { getAndroidDeviceMetadata } from "../utils/android/utils.js"
import { activeLogStreams } from './android/context.js'
import { collectGetUITree } from './android/ui-tree.js'
import { collectGetLogs } from './android/logs.js'
import { collectCaptureScreen } from './android/screenshot.js'
import { collectGetScreenFingerprint } from './android/fingerprint.js'
import { startLogStream, stopLogStream, collectReadLogStream } from './android/log-stream.js'
import { collectGetCurrentScreen } from './android/current-screen.js'

export class AndroidObserve {
  getLogStreamDevice(sessionId: string = 'default') { return activeLogStreams.get(sessionId)?.device ?? null }

  async getDeviceMetadata(appId: string, deviceId?: string): Promise<DeviceInfo> {
    return getAndroidDeviceMetadata(appId, deviceId);
  }

  async getUITree(deviceId?: string): Promise<GetUITreeResponse> {
    return captureEvidence('ui_tree', { platform: 'android', id: deviceId ?? '' }, () => this.collectGetUITree(deviceId))
  }

  private async collectGetUITree(deviceId?: string): Promise<GetUITreeResponse> { return collectGetUITree(deviceId) }

  async getLogs(filters: { appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number } = {}): Promise<GetLogsResponse> {
    return captureEvidence('logs', { platform: 'android', id: filters.deviceId ?? '' }, () => this.collectGetLogs(filters))
  }

  private async collectGetLogs(filters: { appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number } = {}): Promise<GetLogsResponse> { return collectGetLogs(filters) }

  async captureScreen(deviceId?: string): Promise<CaptureAndroidScreenResponse> {
    return captureEvidence('screenshot', { platform: 'android', id: deviceId ?? '' }, () => this.collectCaptureScreen(deviceId))
  }

  private async collectCaptureScreen(deviceId?: string): Promise<CaptureAndroidScreenResponse> { return collectCaptureScreen(deviceId) }

  async getCurrentScreen(deviceId?: string): Promise<GetCurrentScreenResponse> {
    return captureEvidence('activity', { platform: 'android', id: deviceId ?? '' }, () => this.collectGetCurrentScreen(deviceId))
  }

  private async collectGetCurrentScreen(deviceId?: string): Promise<GetCurrentScreenResponse> { return collectGetCurrentScreen(deviceId) }

  async getScreenFingerprint(deviceId?: string): Promise<{ fingerprint: string | null; activity?: string; error?: string; captured_at_ms?: number }> {
    return captureEvidence('fingerprint', { platform: 'android', id: deviceId ?? '' }, () => this.collectGetScreenFingerprint(deviceId))
  }

  private async collectGetScreenFingerprint(deviceId?: string): Promise<{ fingerprint: string | null; activity?: string; error?: string; captured_at_ms?: number }> { return collectGetScreenFingerprint(this, deviceId) }

  async startLogStream(packageName: string, level: 'error' | 'warn' | 'info' | 'debug' = 'error', deviceId?: string, sessionId: string = 'default') { return startLogStream(packageName, level, deviceId, sessionId) }

  async stopLogStream(sessionId: string = 'default') { return stopLogStream(sessionId) }

  async readLogStream(sessionId: string = 'default', limit: number = 100, since?: string) {
    return captureEvidence('logs', this.getLogStreamDevice(sessionId), () => this.collectReadLogStream(sessionId, limit, since))
  }

  private async collectReadLogStream(sessionId: string = 'default', limit: number = 100, since?: string) { return collectReadLogStream(sessionId, limit, since) }
}
