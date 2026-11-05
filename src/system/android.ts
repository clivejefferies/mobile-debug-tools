import { probeInstallation, validAppId, type AppInstallation } from '../utils/app-installation.js'
import { execSync } from 'child_process'
import { ensureAdbAvailable } from '../utils/android/utils.js'

export async function checkAndroid() {
  const issues: string[] = []
  let adbAvailable = false
  let adbVersion = ''
  let devices = 0
  let deviceStates = ''
  let logsAvailable = false
  let envValid = false
  let appInstalled: boolean | undefined = undefined
  let appInstallations: AppInstallation[] = []
  let targets: { id: string; available: boolean }[] = []

  try {
    const adbCheck = ensureAdbAvailable()
    const adbCmd = adbCheck.adbCmd || 'adb'
    adbAvailable = !!adbCheck.ok
    adbVersion = (adbCheck.version || '').toString().split('\n')[0]
    if (!adbAvailable) issues.push('ADB not available')

    try {
      const out = execSync(`${adbCmd} devices -l`, { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      const state = parseDevices(out, issues)
      targets = out.split('\n').map(line => line.trim().split(/\s+/)).filter(parts => parts[0] && !['List', '*'].includes(parts[0])).map(parts => ({ id: parts[0], available: parts[1] === 'device' }))
      devices = state.devices; deviceStates = state.deviceStates

    } catch (e: unknown) { console.debug('[get_system_status] adb devices failed: ' + String(e)); issues.push('Failed to list Android devices') }

    if (adbAvailable && devices > 0) {
      try {
        const lo = execSync(`${adbCmd} logcat -d -t 1`, { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
        logsAvailable = !!lo
        if (!logsAvailable) issues.push('Log access failed')
      } catch (e: unknown) { logsAvailable = false; console.debug('[get_system_status] logcat check failed: ' + String(e)) }
    }

    const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
    envValid = !!sdkRoot || (adbAvailable === true && !!(adbCheck.adbCmd && adbCheck.adbCmd !== 'adb'))
    if (!envValid) issues.push('ANDROID_SDK_ROOT/ANDROID_HOME missing and adb not found in PATH')

    const pkg = process.env.MCP_TARGET_PACKAGE || process.env.MCP_TARGET_APP_ID
    appInstallations = await Promise.all(targets.map(target => probeInstallation(adbCmd, target.id, pkg, 'android-current-user', adbAvailable && target.available)))
    reportInstallations(appInstallations, pkg, issues)
    appInstalled = installationSummary(appInstallations)
  } catch (e: unknown) { console.debug('[get_system_status] adb availability check failed: ' + String(e)); issues.push('ADB check failed') }

  return { adbAvailable, adbVersion, devices, deviceStates, logsAvailable, envValid, appInstalled, appInstallations, issues }
}

function parseDevices(out: string, issues: string[]) {
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
  const deviceLines = lines.filter(l => !l.startsWith('List of devices'))
  const stateCounts: Record<string, number> = {}
  for (const l of deviceLines) {
    const parts = l.split(/\s+/)
    const state = parts[1] || ''
    stateCounts[state] = (stateCounts[state] || 0) + 1
  }
  const devices = deviceLines.length
  const parts = Object.entries(stateCounts).map(([k, v]) => `${v} ${k}`)
  const deviceStates = parts.join(', ')
  if (devices === 0) issues.push('No Android devices connected')
  if (stateCounts['unauthorized']) issues.push(`${stateCounts['unauthorized']} device(s) unauthorized`)
  if (stateCounts['offline']) issues.push(`${stateCounts['offline']} device(s) offline`)
  return { devices, deviceStates }
}


function installationSummary(checks: AppInstallation[]) {
  return checks.length === 1 && checks[0].status !== 'unknown' ? checks[0].status === 'installed' : undefined
}
function reportInstallations(checks: AppInstallation[], pkg: string | undefined, issues: string[]) {
  if (pkg !== undefined && !validAppId(pkg)) issues.push('Invalid target app identifier')
  for (const check of checks) {
    if (check.status === 'absent') issues.push(`App ${check.appId} not installed on device ${check.deviceId}`)
    if (check.status === 'unknown' && check.reason !== 'APP_ID_NOT_PROVIDED') issues.push(`Installation check unavailable on device ${check.deviceId}: ${check.reason}`)
  }
}
