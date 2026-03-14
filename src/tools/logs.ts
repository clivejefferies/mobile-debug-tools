import { resolveTargetDevice } from '../resolve-device.js'
import { AndroidObserve } from '../android/observe.js'
import { iOSObserve } from '../ios/observe.js'
import { startAndroidLogStream, readLogStreamLines, stopAndroidLogStream } from '../android/utils.js'
import { startIOSLogStream, readIOSLogStreamLines, stopIOSLogStream } from '../ios/utils.js'

const androidObserve = new AndroidObserve()

export async function getLogsHandler({ platform, appId, deviceId, lines }: { platform: 'android' | 'ios', appId?: string, deviceId?: string, lines?: number }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
    const deviceInfo = resolved
    const response = await androidObserve.getLogs(appId, lines ?? 200, resolved.id)
    const logs = Array.isArray(response.logs) ? response.logs : []
    const crashLines = logs.filter(line => line.includes('FATAL EXCEPTION'))
    return { device: deviceInfo, logs, crashLines }
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
    const deviceInfo = resolved
    try {
      const iosObs = new iOSObserve()
      const resp = await iosObs.getLogs(appId, resolved.id)
      const logs = Array.isArray(resp.logs) ? resp.logs : []
      const crashLines = logs.filter(l => l.includes('FATAL EXCEPTION'))
      return { device: deviceInfo, logs, crashLines }
    } catch (e) {
      return { device: deviceInfo, logs: [], crashLines: [] }
    }
  }
}

export async function startLogStreamHandler({ platform, packageName, level, sessionId, deviceId }: { platform?: 'android' | 'ios', packageName: string, level?: 'error' | 'warn' | 'info' | 'debug', sessionId?: string, deviceId?: string }) {
  const effectivePlatform = platform || 'android'
  const sid = sessionId || 'default'
  if (effectivePlatform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', appId: packageName, deviceId })
    return await startAndroidLogStream(packageName, level || 'error', resolved.id, sid)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', appId: packageName, deviceId })
    return await startIOSLogStream(packageName, level || 'error', resolved.id, sid)
  }
}

export async function readLogStreamHandler({ platform, sessionId, limit, since }: { platform?: 'android' | 'ios', sessionId?: string, limit?: number, since?: string }) {
  const effectivePlatform = platform || 'android'
  const sid = sessionId || 'default'
  if (effectivePlatform === 'android') {
    return await readLogStreamLines(sid, limit ?? 100, since)
  } else {
    return await readIOSLogStreamLines(sid, limit ?? 100, since)
  }
}

export async function stopLogStreamHandler({ platform, sessionId }: { platform?: 'android' | 'ios', sessionId?: string }) {
  const effectivePlatform = platform || 'android'
  const sid = sessionId || 'default'
  if (effectivePlatform === 'android') {
    return await stopAndroidLogStream(sid)
  } else {
    return await stopIOSLogStream(sid)
  }
}
