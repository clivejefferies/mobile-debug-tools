import { buildIOS } from './ios/build.js'
import type { IOSBuildOptions } from './ios/build-types.js'
export type { IOSBuildOptions } from './ios/build-types.js'
import { evidenceDispatch } from '../observe/evidence.js'
import { hasFiniteBudget, markDispatchStarted, remainingBudget, runWithBudget } from '../utils/operation-budget.js'
import { promises as fs } from "fs"
import { spawn } from "child_process"
import { StartAppResponse, TerminateAppResponse, RestartAppResponse, ResetAppDataResponse, InstallAppResponse } from "../types.js"
import { execCommand, execCommandWithDiagnostics, getIOSDeviceMetadata, validateBundleId, getIdbCmd, findAppBundle } from "../utils/ios/utils.js"
import { iOSObserve } from "../observe/ios.js"

export class iOSManage {
  async build(projectPath: string, optsOrVariant?: string | IOSBuildOptions) { return buildIOS(projectPath, optsOrVariant) }

  async installApp(appPath: string, deviceId: string = "booted"): Promise<InstallAppResponse> {
    const device = await getIOSDeviceMetadata(deviceId)

    try {
      const toInstall = await this.installBundle(appPath)

      try {
        const res = await execCommand(['simctl', 'install', deviceId, toInstall], deviceId)
        return { device, installed: true, output: res.output }
      } catch (e) {
        // Gather diagnostics for simctl failure
        const diag = execCommandWithDiagnostics(['simctl', 'install', deviceId, toInstall], deviceId)
        try {
          const child = spawn(getIdbCmd(), ['list-targets', '--json'])
          const idbExists = await new Promise<boolean>((resolve) => {
            child.on('error', () => resolve(false));
            child.on('close', (code) => resolve(code === 0));
          });
          if (idbExists) {
            // attempt idb install via spawn but include diagnostics
            await installWithIdb(toInstall, device.id)
            return { device, installed: true }
          }
        } catch { }
        return { device, installed: false, error: e instanceof Error ? e.message : String(e), diagnostics: diag }
      }
    } catch (e) {
      return { device, installed: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  private async installBundle(appPath: string): Promise<string> {
    let toInstall = appPath

    const stat = await fs.stat(appPath).catch(() => null)
    if (stat && stat.isDirectory()) {
      if (appPath.endsWith('.app')) {
        toInstall = appPath
      } else {
        const found = await findAppBundle(appPath)
        if (found) {
          toInstall = found
        } else {
          // Reuse the existing build() implementation to avoid duplicating the xcodebuild logic
          const buildRes = await this.build(appPath)
          if ('error' in buildRes) throw new Error(buildRes.error)
          toInstall = buildRes.artifactPath
        }
      }
    }

    return toInstall
  }

  async startApp(bundleId: string, deviceId: string = "booted", observe = true): Promise<StartAppResponse> {
    const started = performance.now()
    validateBundleId(bundleId)
    try {
      markDispatchStarted()
      const result = await evidenceDispatch({ platform: 'ios', id: deviceId }, () => execCommand(['simctl', 'launch', deviceId, bundleId], deviceId))
      const device = await getIOSDeviceMetadata(deviceId)
      const fingerprint = observe ? await new iOSObserve().getScreenFingerprint(deviceId).catch(() => null) : null
      const pidMatch = result.output.match(/:\s*(\d+)\s*$/)
      return {
        device,
        appStarted: !!result.output,
        launchTimeMs: performance.now() - started,
        output: result.output,
        observedApp: {
          appId: bundleId,
          pid: pidMatch ? Number(pidMatch[1]) : null,
          screen: fingerprint?.activity ?? null,
          matchedTarget: null
        }
      }
    } catch (e: unknown) {
      const device = await getIOSDeviceMetadata(deviceId)
      const diagnostics = hasFiniteBudget() ? undefined : execCommandWithDiagnostics(['simctl', 'launch', deviceId, bundleId], deviceId)
      return { device, appStarted: false, launchTimeMs: performance.now() - started, error: e instanceof Error ? e.message : String(e), ...(diagnostics ? { diagnostics } : {}) }
    }
  }

  async terminateApp(bundleId: string, deviceId: string = "booted"): Promise<TerminateAppResponse> {
    validateBundleId(bundleId)
    try {
      markDispatchStarted()
      await evidenceDispatch({ platform: 'ios', id: deviceId }, () => execCommand(['simctl', 'terminate', deviceId, bundleId], deviceId))
      const device = await getIOSDeviceMetadata(deviceId)
      return { device, appTerminated: true }
    } catch (e: unknown) {
      const diag = hasFiniteBudget() ? undefined : execCommandWithDiagnostics(['simctl', 'terminate', deviceId, bundleId], deviceId)
      const device = await getIOSDeviceMetadata(deviceId)
      return { device, appTerminated: false, error: e instanceof Error ? e.message : String(e), ...(diag ? { diagnostics: diag } : {}) }
    }
  }

  async restartApp(bundleId: string, deviceId: string = "booted", observe = true, bounded = false, timeoutMs = 15000): Promise<RestartAppResponse> {
    const started = performance.now()
    const terminateResult = bounded ? await runWithBudget(Math.min(5000, timeoutMs), () => this.terminateApp(bundleId, deviceId)) : await this.terminateApp(bundleId, deviceId)
    const remaining = timeoutMs - (performance.now() - started)
    if (bounded && remaining <= 0) throw new Error('ACTION_TIMEOUT')
    const launchBudget = remainingBudget(remaining)
    const startResult = bounded ? await runWithBudget(launchBudget, () => this.startApp(bundleId, deviceId, observe)) : await this.startApp(bundleId, deviceId, observe)
    return {
      device: startResult.device,
      appRestarted: startResult.appStarted,
      launchTimeMs: startResult.launchTimeMs,
      output: startResult.output,
      observedApp: startResult.observedApp,
      terminatedBeforeRestart: terminateResult.appTerminated,
      ...(terminateResult.error ? { terminateError: terminateResult.error } : {}),
      ...(startResult.error ? { error: startResult.error } : {}),
      ...(startResult.diagnostics ? { diagnostics: startResult.diagnostics } : {})
    }
  }

  async resetAppData(bundleId: string, deviceId: string = "booted"): Promise<ResetAppDataResponse> {
    validateBundleId(bundleId)
    await this.terminateApp(bundleId, deviceId)
    const device = await getIOSDeviceMetadata(deviceId)
    try {
      const containerResult = await execCommand(['simctl', 'get_app_container', deviceId, bundleId, 'data'], deviceId)
      const dataPath = containerResult.output.trim()
      if (!dataPath) throw new Error(`Could not find data container for ${bundleId}`)

      try {
        const libraryPath = `${dataPath}/Library`
        const documentsPath = `${dataPath}/Documents`
        const tmpPath = `${dataPath}/tmp`
        await fs.rm(libraryPath, { recursive: true, force: true }).catch(() => { })
        await fs.rm(documentsPath, { recursive: true, force: true }).catch(() => { })
        await fs.rm(tmpPath, { recursive: true, force: true }).catch(() => { })
        await fs.mkdir(libraryPath, { recursive: true }).catch(() => { })
        await fs.mkdir(documentsPath, { recursive: true }).catch(() => { })
        await fs.mkdir(tmpPath, { recursive: true }).catch(() => { })
        return { device, dataCleared: true }
      } catch (e) {
        throw new Error(`Failed to clear data for ${bundleId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    } catch (e: unknown) {
      const diag = execCommandWithDiagnostics(['simctl', 'get_app_container', deviceId, bundleId, 'data'], deviceId)
      return { device, dataCleared: false, error: e instanceof Error ? e.message : String(e), diagnostics: diag }
    }
  }
}

async function installWithIdb(toInstall: string, deviceId: string) {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(getIdbCmd(), ['install', toInstall, '--udid', deviceId]);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `idb install failed with code ${code}`));
    });
    proc.on('error', err => reject(err));
  });
}
