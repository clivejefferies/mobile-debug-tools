import { DeviceInfo } from "../../types.js"
import { promises as fsPromises } from 'fs'
import path from 'path'
export { findInPath, resolveAdbCmd, getAdbCmd, ensureAdbAvailable, getAdbArgs, getAdbTimeout, type SpawnOptionsWithTimeout, execAdb, spawnAdb } from './commands.js'
import { execAdb } from './commands.js'
export { type GradleEnvOverrides, mergeEnv, prepareGradle } from './gradle.js'
export { parseBounds, getCenter, parseBooleanAttr, parseNumberAttr, normalizeClassName, inferAndroidRole, buildAndroidSelectorConfidence, buildAndroidSelector, buildAndroidSemantic, isSliderLikeAndroid, extractAndroidState, traverseNode } from './ui-tree.js'
export { parseLogLine } from './logs.js'
export function getDeviceInfo(deviceId: string, metadata: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    platform: 'android',
    id: deviceId || 'default',
    osVersion: metadata.osVersion || '',
    model: metadata.model || '',
    simulator: metadata.simulator || false
  }
}

export async function getAndroidDeviceMetadata(appId: string, deviceId?: string): Promise<DeviceInfo> {
  try {
    // If no deviceId provided, try to auto-detect a single connected device
    let resolvedDeviceId = deviceId;
    if (!resolvedDeviceId) {
      try {
        const devicesOutput = await execAdb(['devices']);
        // Parse lines like: "<serial>\tdevice"
        const lines = devicesOutput.split('\n').map(l => l.trim()).filter(Boolean);
        const deviceLines = lines.slice(1) // skip header
          .map(l => l.split('\t'))
          .filter(parts => parts.length >= 2 && parts[1] === 'device')
          .map(parts => parts[0]);
        if (deviceLines.length === 1) {
          resolvedDeviceId = deviceLines[0];
        }
      } catch (e: unknown) {
        console.debug('[getAndroidDeviceMetadata] error detecting single device: ' + String(e))
      }
    }

    // Run these in parallel to avoid sequential timeouts
    const [osVersion, model, simOutput] = await Promise.all([
      execAdb(['shell', 'getprop', 'ro.build.version.release'], resolvedDeviceId).catch(() => ''),
      execAdb(['shell', 'getprop', 'ro.product.model'], resolvedDeviceId).catch(() => ''),
      execAdb(['shell', 'getprop', 'ro.kernel.qemu'], resolvedDeviceId).catch(() => '0')
    ])

    const simulator = simOutput === '1'
    return { platform: 'android', id: resolvedDeviceId || 'default', osVersion, model, simulator }
  } catch (e: unknown) {
    console.debug('[getAndroidDeviceMetadata] failed to gather metadata: ' + String(e))
    return { platform: 'android', id: deviceId || 'default', osVersion: '', model: '', simulator: false }
  }
}

export async function findApk(dir: string): Promise<string | undefined> {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      const found = await findApk(full)
      if (found) return found
    } else if (e.isFile() && full.endsWith('.apk')) {
      return full
    }
  }
  return undefined
}

export async function listAndroidDevices(appId?: string): Promise<DeviceInfo[]> {
  try {
    const devicesOutput = await execAdb(['devices', '-l'])
    const lines = devicesOutput.split('\n').map(l => l.trim()).filter(Boolean)
    // Skip header if present (some adb versions include 'List of devices attached')
    const deviceLines = lines.filter(l => !l.startsWith('List of devices')).map(l => l)
    const serials = deviceLines.map(line => line.split(/\s+/)[0]).filter(Boolean)

    const infos = await Promise.all(serials.map(async (serial) => {
      try {
        const [osVersion, model, simOutput] = await Promise.all([
          execAdb(['shell', 'getprop', 'ro.build.version.release'], serial).catch(() => ''),
          execAdb(['shell', 'getprop', 'ro.product.model'], serial).catch(() => ''),
          execAdb(['shell', 'getprop', 'ro.kernel.qemu'], serial).catch(() => '0')
        ])
        const simulator = simOutput === '1'
        let appInstalled = false
        if (appId) {
          try {
            const pm = await execAdb(['shell', 'pm', 'path', appId], serial)
            appInstalled = !!(pm && pm.includes('package:'))
          } catch (e: unknown) { console.debug(`[listAndroidDevices] pm check failed for ${serial}: ${String(e)}`); appInstalled = false }
        }
        return { platform: 'android', id: serial, osVersion, model, simulator, appInstalled } as DeviceInfo & { appInstalled?: boolean }
      } catch (e: unknown) { console.debug(`[listAndroidDevices] failed gathering metadata for ${serial}: ${String(e)}`); return { platform: 'android', id: serial, osVersion: '', model: '', simulator: false, appInstalled: false } as DeviceInfo & { appInstalled?: boolean } }
    }))

    return infos
  } catch (e: unknown) { console.debug('[listAndroidDevices] failed to list devices: ' + String(e)); return [] }
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getScreenResolution(deviceId?: string): Promise<{ width: number; height: number }> {
  try {
    const output = await execAdb(['shell', 'wm', 'size'], deviceId);
    const match = output.match(/Physical size: (\d+)x(\d+)/);
    if (match) {
      return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
  } catch (e: unknown) { console.debug('[getScreenResolution] failed to detect screen resolution: ' + String(e)) }
  return { width: 0, height: 0 };
}
