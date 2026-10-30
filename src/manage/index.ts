import type { IOSBuildOptions } from './ios.js'
import { promises as fs } from 'fs'
import path from 'path'
import { resolveTargetDevice, listDevices } from '../utils/resolve-device.js'
import { AndroidManage } from './android.js'
import { iOSManage } from './ios.js'
import { findApk } from '../utils/android/utils.js'
import { findAppBundle } from '../utils/ios/utils.js'
import { execSync } from 'child_process'
import type { InstallAppResponse, StartAppResponse, TerminateAppResponse, RestartAppResponse, ResetAppDataResponse } from '../types.js'

export { AndroidManage } from './android.js';
export { iOSManage } from './ios.js';

export async function detectProjectPlatform(projectPath: string): Promise<'ios' | 'android' | 'ambiguous' | 'unknown'> {
  // Recursively scan up to a limited depth for platform markers to avoid mis-detection
  async function scan(dir: string, depth = 3): Promise<{ ios: boolean, android: boolean }> {
    const res = { ios: false, android: false }
    try {
      const ents = await fs.readdir(dir).catch(() => [])
      for (const e of ents) {
        if (e.endsWith('.xcworkspace') || e.endsWith('.xcodeproj')) res.ios = true
        if (e === 'gradlew' || e === 'build.gradle' || e === 'settings.gradle') res.android = true
        if (res.ios && res.android) return res
      }

      if (depth <= 0) return res
      for (const e of ents) {
        try {
          const full = path.join(dir, e)
          const st = await fs.stat(full).catch(() => null)
          if (!st || !st.isDirectory()) continue
          const child = await scan(full, depth - 1)
          if (child.ios) res.ios = true
          if (child.android) res.android = true
          if (res.ios && res.android) return res
        } catch { }
      }
    } catch { }
    return res
  }

  try {
    const stat = await fs.stat(projectPath).catch(() => null)
    if (stat && stat.isDirectory()) {
      const { ios: hasIos, android: hasAndroid } = await scan(projectPath, 3)
      if (hasIos && !hasAndroid) return 'ios'
      if (hasAndroid && !hasIos) return 'android'
      if (hasIos && hasAndroid) return 'ambiguous'
      // no explicit markers found
      return 'unknown'
    } else {
      const ext = path.extname(projectPath).toLowerCase()
      if (ext === '.apk') return 'android'
      if (ext === '.ipa' || ext === '.app') return 'ios'
      return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

type BuildEnv = Record<string, string | undefined>

function mergeDefinedEnv(...parts: Array<BuildEnv | undefined>): BuildEnv {
  const merged: BuildEnv = {}
  for (const part of parts) {
    if (!part) continue
    for (const [key, value] of Object.entries(part)) {
      if (typeof value === 'undefined') continue
      merged[key] = value
    }
  }
  return merged
}

export class ToolsManage {
  static async build_android({ projectPath, gradleTask, maxWorkers, gradleCache, forceClean }: { projectPath: string, gradleTask?: string, maxWorkers?: number, gradleCache?: boolean, forceClean?: boolean }) {
    const android = new AndroidManage()
    const task = gradleTask || 'assembleDebug'
    return await android.build(projectPath, {
      variant: task,
      env: mergeDefinedEnv({
        MCP_GRADLE_TASK: task,
        MCP_GRADLE_WORKERS: typeof maxWorkers === 'number' ? String(maxWorkers) : undefined,
        MCP_GRADLE_CACHE: typeof gradleCache === 'boolean' ? (gradleCache ? '1' : '0') : undefined,
        MCP_FORCE_CLEAN_ANDROID: forceClean ? '1' : undefined
      })
    })
  }

  static async build_ios({ projectPath, workspace: _workspace, project: _project, scheme: _scheme, destinationUDID, derivedDataPath, buildJobs, forceClean }: { projectPath: string, workspace?: string, project?: string, scheme?: string, destinationUDID?: string, derivedDataPath?: string, buildJobs?: number, forceClean?: boolean }) {
    const ios = new iOSManage()

    const opts: IOSBuildOptions = {}
    if (_workspace) opts.workspace = _workspace
    if (_project) opts.project = _project
    if (_scheme) opts.scheme = _scheme
    if (destinationUDID) opts.destinationUDID = destinationUDID
    if (derivedDataPath) opts.derivedDataPath = derivedDataPath
    if (typeof buildJobs === 'number') opts.buildJobs = buildJobs
    if (typeof forceClean === 'boolean') opts.forceClean = forceClean
    // prefer explicit xcodebuild path from env
    if (process.env.XCODEBUILD_PATH) opts.xcodeCmd = process.env.XCODEBUILD_PATH

    return await ios.build(projectPath, {
      ...opts,
      env: mergeDefinedEnv({
        MCP_DERIVED_DATA: derivedDataPath,
        MCP_XCODE_JOBS: typeof buildJobs === 'number' ? String(buildJobs) : undefined,
        MCP_FORCE_CLEAN: typeof forceClean === 'boolean' ? (forceClean ? '1' : '0') : undefined,
        MCP_XCODE_DESTINATION_UDID: destinationUDID,
        XCODEBUILD_PATH: process.env.XCODEBUILD_PATH
      })
    })
  }

  static async build_flutter({ projectPath, platform, buildMode, maxWorkers: _maxWorkers, forceClean: _forceClean }: { projectPath: string, platform?: 'android' | 'ios', buildMode?: 'debug' | 'release' | 'profile', maxWorkers?: number, forceClean?: boolean }) {
    // Prefer using flutter CLI when available; otherwise delegate to native subproject builders
    const flutterCmd = process.env.FLUTTER_PATH || 'flutter'
    // silence unused params
    void _maxWorkers; void _forceClean;
    try {
      // Check flutter presence without streaming output
      execSync(`${flutterCmd} --version`, { stdio: 'ignore' })

      if (!platform || platform === 'android') {
        const mode = buildMode || 'debug'
        try {
          const out = execSync(`${flutterCmd} build apk --${mode}`, { cwd: projectPath, encoding: 'utf8' })
          // Try to find built APK
          const apk = await findApk(path.join(projectPath))
          if (apk) return { artifactPath: apk, output: out }
        } catch (thrown: unknown) {
          throw flutterBuildError(thrown, 'apk')
        }
      }

      if (!platform || platform === 'ios') {
        const mode = buildMode || 'debug'
        try {
          const out = execSync(`${flutterCmd} build ios --${mode} --no-codesign`, { cwd: projectPath, encoding: 'utf8' })
          const app = await findAppBundle(path.join(projectPath))
          if (app) return { artifactPath: app, output: out }
        } catch (thrown: unknown) {
          throw flutterBuildError(thrown, 'ios')
        }
      }
    } catch (e) {
      // If flutter CLI not available or command fails, fall back to native subprojects
      // Preserve error message for diagnostics if needed
      void e
    }

    return buildFlutterNative(projectPath, platform, _forceClean)
  }

  static async build_react_native({ projectPath, platform, variant, maxWorkers: _maxWorkers, forceClean: _forceClean }: { projectPath: string, platform?: 'android' | 'ios', variant?: string, maxWorkers?: number, forceClean?: boolean }) {
    // silence unused params
    void _maxWorkers; void _forceClean;
    // React Native typically uses native subprojects. Delegate to Android/iOS builders.
    if (!platform || platform === 'android') {
      const androidDir = path.join(projectPath, 'android')
      const android = new AndroidManage()
      const artifact = await android.build(androidDir, variant || 'assembleDebug')
      return artifact
    }
    if (!platform || platform === 'ios') {
      const iosDir = path.join(projectPath, 'ios')
      // Recommend running `pod install` prior to building in CI; not performed automatically here
      const ios = new iOSManage()
      const artifact = await ios.build(iosDir)
      return artifact
    }
    return { error: 'Unable to build react-native project' }
  }

  static async buildAppHandler({ platform, projectPath, variant, projectType: _projectType }: { platform?: 'android' | 'ios', projectPath: string, variant?: string, projectType?: 'native' | 'kmp' | 'react-native' | 'flutter' }) {
    void _projectType;
    // delegate to platform-specific build implementations
    const chosen = platform || 'android'
    if (chosen === 'android') {
      const android = new AndroidManage()
      const artifact = await android.build(projectPath, { variant })
      return artifact
    } else {
      const ios = new iOSManage()
      const artifact = await ios.build(projectPath, { variant })
      return artifact
    }
  }

  static async installAppHandler({ platform, appPath, deviceId, projectType }: { platform: 'android' | 'ios', appPath: string, deviceId?: string, projectType: 'native' | 'kmp' | 'react-native' | 'flutter' }): Promise<InstallAppResponse> {
    // Enforce explicit platform and projectType: both are mandatory to avoid ambiguity
    if (!platform || !projectType) {
      throw new Error('Both platform and projectType parameters are required (platform: ios|android, projectType: native|kmp|react-native|flutter).')
    }

    const chosenPlatform: 'android' | 'ios' = platform

    if (chosenPlatform === 'android') {
      const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
      const androidRun = new AndroidManage()
      const result = await androidRun.installApp(appPath, resolved.id)
      return result
    } else {
      const resolved = await resolveTargetDevice({ platform: 'ios', deviceId })
      const iosRun = new iOSManage()
      const result = await iosRun.installApp(appPath, resolved.id)
      return result
    }
  }

  static async startAppHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }): Promise<StartAppResponse> {
    if (platform === 'android') {
      const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
      return await new AndroidManage().startApp(appId, resolved.id)
    } else {
      const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
      return await new iOSManage().startApp(appId, resolved.id)
    }
  }

  static async terminateAppHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }): Promise<TerminateAppResponse> {
    if (platform === 'android') {
      const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
      return await new AndroidManage().terminateApp(appId, resolved.id)
    } else {
      const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
      return await new iOSManage().terminateApp(appId, resolved.id)
    }
  }

  static async restartAppHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }): Promise<RestartAppResponse> {
    if (platform === 'android') {
      const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
      return await new AndroidManage().restartApp(appId, resolved.id)
    } else {
      const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
      return await new iOSManage().restartApp(appId, resolved.id)
    }
  }

  static async resetAppDataHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }): Promise<ResetAppDataResponse> {
    if (platform === 'android') {
      const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
      return await new AndroidManage().resetAppData(appId, resolved.id)
    } else {
      const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
      return await new iOSManage().resetAppData(appId, resolved.id)
    }
  }

  static async buildAndInstallHandler({ platform, projectPath, deviceId, timeout, projectType }: { platform: 'android' | 'ios', projectPath: string, deviceId?: string, timeout?: number, projectType: 'native' | 'kmp' | 'react-native' | 'flutter' }) {
    const events: string[] = []
    const pushEvent = (obj: unknown) => events.push(JSON.stringify(obj))
    const effectiveTimeout = timeout ?? 180000 // reserved for future streaming/timeouts
    void effectiveTimeout

    // Require explicit platform and projectType to avoid ambiguous autodetection
    if (!platform || !projectType) {
      pushEvent({ type: 'build', status: 'failed', error: 'Both platform and projectType parameters are required.' })
      return { ndjson: events.join('\n') + '\n', result: { success: false, error: 'Both platform and projectType parameters are required (platform: ios|android, projectType: native|kmp|react-native|flutter).' } }
    }

    // Explicit platform/projectType were required above; no autodetection occurs.
    const chosenPlatform = platform

    pushEvent({ type: 'build', status: 'started', platform: chosenPlatform })

    let buildRes: { artifactPath?: string; error?: string; output?: string; diagnostics?: unknown }
    try {
      buildRes = await ToolsManage.buildAppHandler({ platform: chosenPlatform, projectPath })
      if (buildRes && buildRes.error) {
        pushEvent({ type: 'build', status: 'failed', error: buildRes.error })
        return { ndjson: events.join('\n') + '\n', result: { success: false, error: buildRes.error } }
      }
      pushEvent({ type: 'build', status: 'finished', artifactPath: buildRes.artifactPath })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushEvent({ type: 'build', status: 'failed', error: msg })
      return { ndjson: events.join('\n') + '\n', result: { success: false, error: msg } }
    }

    // Install phase
    const artifact = buildRes.artifactPath || projectPath
    pushEvent({ type: 'install', status: 'started', artifactPath: artifact, deviceId })
    let installRes: InstallAppResponse
    try {
      installRes = await ToolsManage.installAppHandler({ platform: chosenPlatform, appPath: artifact, deviceId, projectType })
      if (installRes && installRes.installed === true) {
        pushEvent({ type: 'install', status: 'finished', artifactPath: artifact, device: installRes.device })
        return { ndjson: events.join('\n') + '\n', result: { success: true, artifactPath: artifact, device: installRes.device, output: installRes.output } }
      } else {
        pushEvent({ type: 'install', status: 'failed', error: installRes.error || 'unknown' })
        return { ndjson: events.join('\n') + '\n', result: { success: false, error: installRes.error || 'install failed' } }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushEvent({ type: 'install', status: 'failed', error: msg })
      return { ndjson: events.join('\n') + '\n', result: { success: false, error: msg } }
    }
  }

  static async listDevicesHandler({ platform, appId }: { platform?: 'android' | 'ios', appId?: string }) {
    const devices = await listDevices(platform, appId)
    return { devices }
  }
}

async function buildFlutterNative(projectPath: string, platform?: 'android' | 'ios', _forceClean?: boolean) {
  // Fallback: try native subproject builds
  if (!platform || platform === 'android') {
    const androidDir = path.join(projectPath, 'android')
    const android = new AndroidManage()
    const artifact = await android.build(androidDir, _forceClean ? 'clean && assembleDebug' : 'assembleDebug')
    return artifact
  }
  if (!platform || platform === 'ios') {
    const iosDir = path.join(projectPath, 'ios')
    const ios = new iOSManage()
    const artifact = await ios.build(iosDir)
    return artifact
  }

  return { error: 'Unable to build flutter project' }
}

function flutterBuildError(thrown: unknown, kind: string): Error {
  const err = thrown as { stdout?: unknown; stderr?: unknown; message?: string }
  const stdout = err && err.stdout ? String(err.stdout) : ''
  const stderr = err && err.stderr ? String(err.stderr) : ''
  return new Error(`flutter build ${kind} failed: ${stderr || stdout || err.message}`)
}
