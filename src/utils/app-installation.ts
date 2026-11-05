import { execFile } from 'node:child_process'
import { execCmd } from './exec.js'
import { remainingBudget } from './operation-budget.js'

export interface AppInstallation {
  status: 'installed' | 'absent' | 'unknown'
  appId: string | null
  deviceId: string
  scope: 'android-current-user' | 'ios-simulator'
  checkedAt: string | null
  reason?: 'APP_ID_NOT_PROVIDED' | 'DEVICE_UNAVAILABLE' | 'CHECK_FAILED' | 'UNRECOGNIZED_RESPONSE'
}
export function validAppId(appId: string) { return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(appId) }
export function installationContext(deviceId: string, appId: string | undefined, scope: AppInstallation['scope']): AppInstallation {
  return { status: 'unknown', appId: appId ?? null, deviceId, scope, checkedAt: null, reason: appId === undefined ? 'APP_ID_NOT_PROVIDED' : 'CHECK_FAILED' }
}
export function installationFields(appInstallation: AppInstallation) {
  return { appInstallation, ...(appInstallation.status === 'unknown' ? {} : { appInstalled: appInstallation.status === 'installed' }) }
}
export async function probeInstallation(command: string, deviceId: string, appId: string | undefined, scope: AppInstallation['scope'], available = true): Promise<AppInstallation> {
  const result = installationContext(deviceId, appId, scope)
  if (appId === undefined || !validAppId(appId)) return result
  if (!available) return { ...result, reason: 'DEVICE_UNAVAILABLE' }
  try {
    return await runProbe(command, result)
  } catch {
    return { ...result, checkedAt: new Date().toISOString(), reason: 'CHECK_FAILED' }
  }
}
async function runProbe(command: string, context: AppInstallation): Promise<AppInstallation> {
  const android = context.scope === 'android-current-user'
  const started = performance.now()
  const timeout = remainingBudget(5000)
  const args = android ? ['-s', context.deviceId, 'shell', 'pm', 'path', context.appId!] : ['simctl', 'listapps', context.deviceId]
  const output = await execCmd(command, args, { timeout })
  const result = { ...context, checkedAt: new Date().toISOString() }
  if (output.exitCode !== 0) {
    if (android && !output.stdout && !output.stderr) return confirmAndroidAbsence(command, result, Math.max(1, timeout - (performance.now() - started)))
    return { ...result, reason: 'CHECK_FAILED' }
  }
  let status: AppInstallation['status']
  if (android) {
    const lines = output.stdout.trim().split('\n').filter(Boolean)
    if (lines.some(line => !/^package:\/\S+$/.test(line.trim()))) return { ...result, reason: 'UNRECOGNIZED_RESPONSE' }
    status = lines.length ? 'installed' : 'absent'
  } else {
    try {
      const budget = remainingBudget(Math.max(1, Math.floor(timeout - (performance.now() - started))))
      if (performance.now() - started >= timeout) return { ...result, reason: 'CHECK_FAILED' }
      const json = await new Promise<string>((resolve, reject) => {
        const child = execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { timeout: budget, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout))
        child.stdin?.on('error', reject)
        child.stdin?.end(output.stdout)
      })
      const apps: unknown = JSON.parse(json)
      if (!apps || typeof apps !== 'object' || Array.isArray(apps)) return { ...result, reason: 'UNRECOGNIZED_RESPONSE' }
      if (Object.values(apps).some(value => !value || typeof value !== 'object' || Array.isArray(value))) return { ...result, reason: 'UNRECOGNIZED_RESPONSE' }
      status = Object.hasOwn(apps, context.appId!) ? 'installed' : 'absent'
    } catch { return { ...result, reason: 'UNRECOGNIZED_RESPONSE' } }
  }
  const { reason: _reason, ...confirmed } = result
  return { ...confirmed, status }
}

async function confirmAndroidAbsence(command: string, context: AppInstallation, timeout: number): Promise<AppInstallation> {
  const output = await execCmd(command, ['-s', context.deviceId, 'shell', 'pm', 'list', 'packages', context.appId!], { timeout })
  const result = { ...context, checkedAt: new Date().toISOString() }
  if (output.exitCode !== 0) return { ...result, reason: 'CHECK_FAILED' }
  const lines = output.stdout.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.some(line => !/^package:[A-Za-z0-9_.-]+$/.test(line))) return { ...result, reason: 'UNRECOGNIZED_RESPONSE' }
  const { reason: _reason, ...confirmed } = result
  return { ...confirmed, status: lines.includes(`package:${context.appId}`) ? 'installed' : 'absent' }
}
