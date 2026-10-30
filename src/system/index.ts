import type { HostOs } from './model.js'
import { checkAndroid } from './android.js'
import { checkGradle } from './gradle.js'
import { checkIOS } from './ios.js'
import { detectJavaHome } from '../utils/java.js'
import { buildAndroidPlatform } from './android-status.js'
import { buildIOSPlatform } from './ios-status.js'
import { buildLegacySummary } from './status-summary.js'
import { buildUnsupportedHostStatus } from './unsupported-status.js'
import { normalizeHostOs, isSupportedHost, probeCommand, makeToolEntry, describeJavaDiscovery, resolveJavaBinaryPath } from './probes.js'

export async function getSystemStatus() {
  const hostOs = normalizeHostOs((process.env.MOBILE_DEBUG_MCP_HOST_OS || process.platform) as NodeJS.Platform)
  if (!isSupportedHost(hostOs)) {
    return buildUnsupportedHostStatus(hostOs)
  }

  try {
    const [androidRaw, gradleRaw] = await Promise.all([checkAndroid(), checkGradle()])
    const iosRaw = hostOs === 'macos'
      ? await checkIOS()
      : {
        iosAvailable: false,
        iosDevices: 0,
        issues: ['iOS tooling is only supported on macOS.']
      }

    const androidStatus = buildAndroidPlatform(androidRaw, true)
    const iosStatus = buildIOSPlatform(iosRaw as Awaited<ReturnType<typeof checkIOS>>, hostOs === 'macos', hostOs)
    const gradle = gradleRaw

    const issues = [...androidRaw.issues, ...iosRaw.issues, ...(gradle.issues || [])]
    const success = issues.length === 0
    const androidReady = androidRaw.adbAvailable && androidRaw.devices > 0 && !androidRaw.issues.some((issue) => /unauthorized|offline/i.test(issue))
    const iosReady = hostOs === 'macos' ? (iosRaw.iosAvailable && iosRaw.iosDevices > 0) : false
    const overallStatus = success ? 'ready' : (androidReady || iosReady ? 'degraded' : 'blocked')

    const javaTool = await javaStatus(gradle, hostOs)

    return {
      success,
      status: overallStatus,
      adbAvailable: androidRaw.adbAvailable,
      adbVersion: androidRaw.adbVersion,
      devices: androidRaw.devices,
      deviceStates: androidRaw.deviceStates,
      logsAvailable: androidRaw.logsAvailable,
      envValid: androidRaw.envValid,
      issues,
      appInstalled: androidRaw.appInstalled,
      iosAvailable: iosRaw.iosAvailable,
      iosDevices: iosRaw.iosDevices,
      gradleJavaHome: gradle.gradleJavaHome,
      gradleValid: gradle.gradleValid,
      gradleFilesChecked: gradle.filesChecked,
      gradleSuggestedFixes: gradle.suggestedFixes,
      host: {
        os: hostOs,
        supported: true
      },
      android: {
        ...androidStatus,
        status: androidStatus.status
      },
      ios: {
        ...iosStatus,
        status: iosStatus.status
      },
      summary: buildLegacySummary(androidStatus, iosStatus, gradle),
      tools: {
        android: {
          adb: androidStatus.tools.adb,
          java: javaTool
        },
        ios: iosStatus.tools,
        gradle: {
          java: javaTool
        }
      }
    }
  } catch (e: unknown) {
    return {
      success: false,
      status: 'blocked',
      issues: ['Internal error: ' + (e instanceof Error ? e.message : String(e))],
      summary: {
        overall: 'blocked',
        android: { ready: false, summary: 'Android status unavailable', blockers: [] },
        ios: { ready: false, summary: 'iOS status unavailable', blockers: [] },
        gradle: { ready: false, summary: 'Gradle status unavailable', blockers: [], suggestedFixes: [] }
      }
    }
  }
}

async function javaStatus(gradle: Awaited<ReturnType<typeof checkGradle>>, hostOs: HostOs) {
  const javaHome = gradle.gradleJavaHome || (await detectJavaHome().catch(() => undefined))
  const javaBin = javaHome ? resolveJavaBinaryPath(javaHome, hostOs) : null
  const javaProbe = javaBin ? probeCommand(javaBin, ['-version']) : { ok: false, raw: null, parsedVersion: null }
  const javaTool = makeToolEntry(
    javaBin,
    describeJavaDiscovery(javaHome ?? null).discoverySource,
    javaProbe.raw,
    javaProbe.ok ? 'valid' : (javaHome ? 'invalid' : 'missing')
  )

  return javaTool
}
