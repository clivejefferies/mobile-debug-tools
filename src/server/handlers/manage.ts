import { measure } from '../../utils/timing.js'
import { notifyActionStart } from '../../interact/conditional-action.js'
import type {
  InstallAppResponse,
  ResetAppDataResponse,
  TerminateAppResponse
} from '../../types.js'
import { AndroidManage, iOSManage, ToolsManage } from '../../manage/index.js'
import {
  buildActionExecutionResult,
  captureActionFingerprint,
  getNumberArg,
  getStringArg,
  inferGenericFailure,
  requireStringArg,
  ToolCallArgs,
  wrapResponse
} from '../common.js'
import type { PlatformArg, ProjectTypeArg } from './handler-types.js'
import { interactionControls, actionHandler } from './action-execution.js'

export async function executeStartApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const res = await measure('dispatch_ms', () => (platform === 'android' ? new AndroidManage().startApp(appId, deviceId, actionTimeoutMs ?? (verificationMode === 'full' && getStringArg(args, 'responseMode') === undefined && args._journey !== true ? undefined : 10000)) : new iOSManage().startApp(appId, deviceId, verificationMode === 'full')))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'start_app',
    sourceModule: 'server',
    device: res.device,
    selector: { appId },
    success: !!res.appStarted,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.appStarted ? undefined : inferGenericFailure(res.error),
    details: {
      launch_time_ms: res.launchTimeMs,
      ...(typeof res.output === 'string' ? { output: res.output } : {}),
      ...(res.device ? { device_id: res.device.id } : {}),
      ...(typeof res.error === 'string' ? { error: res.error } : {}),
      ...(res.diagnostics ? { diagnostics: res.diagnostics } : {}),
      ...(res.observedApp ? { observed_app: res.observedApp } : {})
    }
  })
  return wrapResponse(result)
}

export async function handleTerminateApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await (platform === 'android' ? new AndroidManage().terminateApp(appId, deviceId) : new iOSManage().terminateApp(appId, deviceId))
  const response: TerminateAppResponse = { device: res.device, appTerminated: res.appTerminated }
  return wrapResponse(response)
}

export async function executeRestartApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const { verificationMode, actionTimeoutMs } = interactionControls(args)
  const uiFingerprintBefore = verificationMode === 'full' ? await measure('pre_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  notifyActionStart()
  const bounded = args._journey === true || verificationMode !== 'full' || args.responseMode !== undefined || actionTimeoutMs !== undefined
  const res = await measure('dispatch_ms', () => (platform === 'android' ? new AndroidManage().restartApp(appId, deviceId, bounded, actionTimeoutMs ?? 15000) : new iOSManage().restartApp(appId, deviceId, verificationMode === 'full', bounded, actionTimeoutMs ?? 15000)))
  const uiFingerprintAfter = verificationMode === 'full' ? await measure('post_observation_ms', () => captureActionFingerprint(platform, deviceId)) : null
  const result = buildActionExecutionResult({
    actionType: 'restart_app',
    sourceModule: 'server',
    device: res.device,
    selector: { appId },
    success: !!res.appRestarted,
    uiFingerprintBefore,
    uiFingerprintAfter,
    failure: res.appRestarted ? undefined : inferGenericFailure(res.error),
    details: {
      launch_time_ms: res.launchTimeMs,
      ...(typeof res.output === 'string' ? { output: res.output } : {}),
      ...(typeof res.terminatedBeforeRestart === 'boolean' ? { terminated_before_restart: res.terminatedBeforeRestart } : {}),
      ...(typeof res.terminateError === 'string' ? { terminate_error: res.terminateError } : {}),
      ...(typeof res.error === 'string' ? { error: res.error } : {}),
      ...(res.diagnostics ? { diagnostics: res.diagnostics } : {}),
      ...(res.observedApp ? { observed_app: res.observedApp } : {})
    }
  })
  return wrapResponse(result)
}

export async function handleResetAppData(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const appId = requireStringArg(args, 'appId')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await (platform === 'android' ? new AndroidManage().resetAppData(appId, deviceId) : new iOSManage().resetAppData(appId, deviceId))
  const response: ResetAppDataResponse = { device: res.device, dataCleared: res.dataCleared }
  return wrapResponse(response)
}

export async function handleInstallApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const projectType = requireStringArg(args, 'projectType') as ProjectTypeArg
  const appPath = requireStringArg(args, 'appPath')
  const deviceId = getStringArg(args, 'deviceId')
  const res = await ToolsManage.installAppHandler({ platform, appPath, deviceId, projectType })
  const response: InstallAppResponse = {
    device: res.device,
    installed: res.installed,
    output: res.output,
    error: res.error
  }
  return wrapResponse(response)
}

export async function handleBuildApp(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const projectType = requireStringArg(args, 'projectType') as ProjectTypeArg
  const projectPath = requireStringArg(args, 'projectPath')
  const variant = getStringArg(args, 'variant')
  const res = await ToolsManage.buildAppHandler({ platform, projectPath, variant, projectType })
  return wrapResponse(res)
}

export async function handleBuildAndInstall(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const projectType = requireStringArg(args, 'projectType') as ProjectTypeArg
  const projectPath = requireStringArg(args, 'projectPath')
  const deviceId = getStringArg(args, 'deviceId')
  const timeout = getNumberArg(args, 'timeout')
  const res = await ToolsManage.buildAndInstallHandler({ platform, projectPath, deviceId, timeout, projectType })
  return {
    content: [
      { type: 'text' as const, text: res.ndjson },
      { type: 'text' as const, text: JSON.stringify(res.result, null, 2) }
    ]
  }
}
export const handleStartApp = actionHandler('start_app', executeStartApp)
export const handleRestartApp = actionHandler('restart_app', executeRestartApp)
