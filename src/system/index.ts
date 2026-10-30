import { spawnSync } from 'child_process'
import path from 'path'

import { checkAndroid } from './android.js'
import { checkGradle } from './gradle.js'
import { checkIOS } from './ios.js'
import { resolveAdbCmd } from '../utils/android/utils.js'
import { getIdbCmd, getXcrunCmd } from '../utils/ios/utils.js'
import { probeIdb } from '../utils/cli/idb/idb-helper.js'
import { detectJavaHome } from '../utils/java.js'

type HostOs = 'macos' | 'linux' | 'windows' | 'freebsd' | 'openbsd' | 'netbsd' | 'sunos' | 'unknown'
type PlatformStatus = 'ready' | 'partially_ready' | 'unavailable' | 'unsupported'
type ValidationStatus = 'valid' | 'invalid' | 'missing' | 'unsupported' | 'unknown'

interface DiagnosticFailure {
  code: string
  platform: 'android' | 'ios'
  tool: string | null
  message: string
  searchedLocations: string[]
  selectedProvider: string | null
  rawVersion: string | null
  remediation: string[]
}

interface ToolEntry {
  resolvedPath: string | null
  discoverySource: string | null
  parsedVersion: string | null
  rawVersionOutput: string | null
  validationStatus: ValidationStatus
}

interface CapabilityEntry {
  probeRequired?: string
  availability: boolean
  selectedProvider: string | null
  blockingFailure: DiagnosticFailure | null
}

interface PlatformEntry {
  status: PlatformStatus
  tools: Record<string, ToolEntry>
  providers: Record<string, { available: boolean; selected: boolean; tool: string | null; probeRequired?: string }>
  capabilities: Record<string, CapabilityEntry>
  devices: Array<Record<string, unknown>>
  failures: DiagnosticFailure[]
}

function normalizeHostOs(platform: NodeJS.Platform): HostOs {
  switch (platform) {
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    case 'win32':
      return 'windows'
    case 'freebsd':
    case 'openbsd':
    case 'netbsd':
    case 'sunos':
      return platform
    default:
      return 'unknown'
  }
}

function isSupportedHost(hostOs: HostOs): boolean {
  return hostOs === 'macos' || hostOs === 'linux' || hostOs === 'windows'
}

function firstVersionToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = String(raw).match(/(\d+(?:\.\d+)+|\d+)/)
  return match?.[1] ?? null
}

function probeCommand(command: string, args: string[], timeoutMs = 2000): { ok: boolean, raw: string | null, parsedVersion: string | null } {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] })
    const raw = `${result.stdout || ''}${result.stderr || ''}`.trim() || null
    return {
      ok: result.status === 0,
      raw,
      parsedVersion: firstVersionToken(raw)
    }
  } catch {
    return { ok: false, raw: null, parsedVersion: null }
  }
}

function makeFailure(
  code: string,
  platform: 'android' | 'ios',
  message: string,
  opts: Partial<DiagnosticFailure> = {}
): DiagnosticFailure {
  return {
    code,
    platform,
    tool: opts.tool ?? null,
    message,
    searchedLocations: opts.searchedLocations ?? [],
    selectedProvider: opts.selectedProvider ?? null,
    rawVersion: opts.rawVersion ?? null,
    remediation: opts.remediation ?? []
  }
}

function makeToolEntry(
  resolvedPath: string | null,
  discoverySource: string | null,
  rawVersionOutput: string | null,
  validationStatus: ValidationStatus
): ToolEntry {
  return {
    resolvedPath,
    discoverySource,
    parsedVersion: firstVersionToken(rawVersionOutput),
    rawVersionOutput,
    validationStatus
  }
}

function describeAdbDiscovery(adbCmd: string): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['ADB_PATH', 'ANDROID_SDK_ROOT/platform-tools/adb', 'ANDROID_HOME/platform-tools/adb', '~/Library/Android/sdk/platform-tools/adb', 'PATH']
  if (process.env.ADB_PATH && process.env.ADB_PATH.trim()) return { discoverySource: 'ADB_PATH', searchedLocations }
  if (process.env.ANDROID_SDK_ROOT) return { discoverySource: 'ANDROID_SDK_ROOT', searchedLocations }
  if (process.env.ANDROID_HOME) return { discoverySource: 'ANDROID_HOME', searchedLocations }
  if (adbCmd.includes('Library/Android/sdk')) return { discoverySource: 'HOME_SDK', searchedLocations }
  if (adbCmd === 'adb') return { discoverySource: 'PATH_OR_FALLBACK', searchedLocations }
  return { discoverySource: 'PATH', searchedLocations }
}

function describeXcrunDiscovery(xcrunCmd: string): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['XCRUN_PATH', 'PATH']
  if (process.env.XCRUN_PATH && process.env.XCRUN_PATH.trim()) return { discoverySource: 'XCRUN_PATH', searchedLocations }
  return { discoverySource: xcrunCmd === 'xcrun' ? 'PATH' : 'PATH', searchedLocations }
}

function describeIdbDiscovery(idbCmd: string): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['MCP_IDB_PATH', 'IDB_PATH', 'mcp.config.json', '~/.mcp/config.json', 'PATH', '/opt/homebrew/bin/idb', '/usr/local/bin/idb']
  if (process.env.MCP_IDB_PATH && process.env.MCP_IDB_PATH.trim()) return { discoverySource: 'MCP_IDB_PATH', searchedLocations }
  if (process.env.IDB_PATH && process.env.IDB_PATH.trim()) return { discoverySource: 'IDB_PATH', searchedLocations }
  return { discoverySource: idbCmd === 'idb' ? 'PATH_OR_FALLBACK' : 'PATH', searchedLocations }
}

function describeJavaDiscovery(javaHome: string | null): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['GRADLE_JAVA_HOME', 'JAVA_HOME', 'GRADLE_HOME', 'detectJavaHome']
  if (process.env.GRADLE_JAVA_HOME && process.env.GRADLE_JAVA_HOME.trim()) return { discoverySource: 'GRADLE_JAVA_HOME', searchedLocations }
  if (process.env.JAVA_HOME && process.env.JAVA_HOME.trim()) return { discoverySource: 'JAVA_HOME', searchedLocations }
  if (process.env.GRADLE_HOME && process.env.GRADLE_HOME.trim()) return { discoverySource: 'GRADLE_HOME', searchedLocations }
  return { discoverySource: javaHome ? 'detected' : null, searchedLocations }
}

function resolveJavaBinaryPath(javaHome: string, hostOs: HostOs): string {
  const javaBinary = hostOs === 'windows' ? 'java.exe' : 'java'
  return path.join(javaHome, 'bin', javaBinary)
}

function buildUnsupportedHostStatus(hostOs: HostOs) {
  const failureMessage = `Host operating system '${hostOs}' is not supported.`
  const remediation = ['Run Mobile Debug MCP on macOS, Linux, or Windows.']
  const failureAndroid = makeFailure('HOST_OS_UNSUPPORTED', 'android', failureMessage, {
    remediation
  })
  const failureIos = makeFailure('HOST_OS_UNSUPPORTED', 'ios', failureMessage, {
    remediation
  })

  return {
    success: false,
    status: 'blocked',
    adbAvailable: false,
    adbVersion: '',
    devices: 0,
    deviceStates: '',
    logsAvailable: false,
    envValid: false,
    issues: [failureMessage],
    appInstalled: undefined,
    iosAvailable: false,
    iosDevices: 0,
    gradleJavaHome: undefined,
    gradleValid: false,
    gradleFilesChecked: [],
    gradleSuggestedFixes: [],
    host: { os: hostOs, supported: false },
    android: {
      status: 'unsupported',
      tools: {},
      providers: {},
      capabilities: {},
      devices: [],
      failures: [failureAndroid]
    },
    ios: {
      status: 'unsupported',
      tools: {},
      providers: {},
      capabilities: {},
      devices: [],
      failures: [failureIos]
    },
    summary: {
      overall: 'blocked',
      android: { ready: false, summary: `Host operating system '${hostOs}' is not supported.`, blockers: [failureMessage] },
      ios: { ready: false, summary: `Host operating system '${hostOs}' is not supported.`, blockers: [failureMessage] },
      gradle: { ready: false, summary: 'Gradle status unavailable on unsupported host', blockers: [], suggestedFixes: [] }
    }
  }
}

function buildAndroidPlatform(android: Awaited<ReturnType<typeof checkAndroid>>, hostSupported: boolean): PlatformEntry {
  const resolvedAdbCmd = resolveAdbCmd()
  const adbDiscovery = describeAdbDiscovery(resolvedAdbCmd)
  const adbTool = makeToolEntry(
    resolvedAdbCmd,
    adbDiscovery.discoverySource,
    android.adbVersion || null,
    android.adbAvailable ? 'valid' : 'invalid'
  )

  const adbAvailable = !!android.adbAvailable
  const deviceIssues = android.issues.filter((issue) => /unauthorized|offline|No Android devices connected/i.test(issue))
  const envFailure = !android.envValid
    ? makeFailure('TOOL_VALIDATION_FAILED', 'android', 'Android environment prerequisites are incomplete.', {
      tool: 'adb',
      searchedLocations: ['ANDROID_SDK_ROOT', 'ANDROID_HOME', 'PATH'],
      selectedProvider: 'adb',
      rawVersion: android.adbVersion || null,
      remediation: ['Set ANDROID_SDK_ROOT or ANDROID_HOME, or ensure adb is on PATH.']
    })
    : null

  const adbFailure = !adbAvailable
    ? makeFailure(
      process.env.ADB_PATH && process.env.ADB_PATH.trim() ? 'TOOL_NOT_EXECUTABLE' : 'TOOL_NOT_FOUND',
      'android',
      'Android adb could not be resolved or executed.',
      {
      tool: 'adb',
      searchedLocations: adbDiscovery.searchedLocations,
      selectedProvider: null,
      rawVersion: android.adbVersion || null,
      remediation: [
          'Install Android platform-tools.',
          'Set ADB_PATH or ANDROID_SDK_ROOT/ANDROID_HOME if adb is installed in a non-standard location.'
        ]
      }
    )
    : null

  const deviceFailure = adbAvailable && android.devices === 0
    ? makeFailure('DEVICE_NOT_FOUND', 'android', 'No Android devices or emulators are connected.', {
      tool: 'adb',
      searchedLocations: ['adb devices -l'],
      selectedProvider: 'adb',
      rawVersion: android.adbVersion || null,
      remediation: ['Start an emulator or connect a device, then re-run adb devices.']
    })
    : null

  const diagnosticFailures = [adbFailure, envFailure, deviceFailure].filter((value): value is DiagnosticFailure => value !== null)

  const status: PlatformStatus = !hostSupported
    ? 'unsupported'
    : !adbAvailable
      ? 'unavailable'
      : (android.devices === 0 || deviceIssues.length > 0 || !android.logsAvailable || !android.envValid)
        ? 'partially_ready'
        : 'ready'

  const deviceEntries = android.devices > 0
    ? Array.from({ length: android.devices }, (_, index) => ({
      id: `android-device-${index + 1}`,
      state: deviceIssues.length > 0 ? 'degraded' : 'connected'
    }))
    : []

  const deviceDiscoveryAvailable = adbAvailable
  const installAvailable = adbAvailable && android.devices > 0 && deviceIssues.length === 0
  const logAvailable = adbAvailable && android.logsAvailable

  return {
    status,
    tools: {
      adb: adbTool
    },
    providers: {
      adb: { available: adbAvailable, selected: true, tool: 'adb' },
      jdwp: { available: false, selected: false, tool: 'adb', probeRequired: 'get_debugger_capabilities' }
    },
    capabilities: {
      device_discovery: {
        availability: deviceDiscoveryAvailable,
        selectedProvider: deviceDiscoveryAvailable ? 'adb' : null,
        blockingFailure: deviceDiscoveryAvailable ? null : diagnosticFailures[0] ?? null
      },
      install_app: {
        availability: installAvailable,
        selectedProvider: installAvailable ? 'adb' : null,
        blockingFailure: installAvailable ? null : deviceFailure ?? adbFailure ?? envFailure
      },
      launch_app: {
        availability: installAvailable,
        selectedProvider: installAvailable ? 'adb' : null,
        blockingFailure: installAvailable ? null : deviceFailure ?? adbFailure ?? envFailure
      },
      ui_interaction: {
        availability: installAvailable,
        selectedProvider: installAvailable ? 'adb' : null,
        blockingFailure: installAvailable ? null : deviceFailure ?? adbFailure ?? envFailure
      },
      screenshot: {
        availability: installAvailable,
        selectedProvider: installAvailable ? 'adb' : null,
        blockingFailure: installAvailable ? null : deviceFailure ?? adbFailure ?? envFailure
      },
      log_capture: {
        availability: logAvailable,
        selectedProvider: logAvailable ? 'adb' : null,
        blockingFailure: logAvailable ? null : adbFailure ?? envFailure
      },
      debug: {
        probeRequired: 'get_debugger_capabilities',
        availability: false,
        selectedProvider: null,
        blockingFailure: deviceFailure ?? adbFailure ?? envFailure
      }
    },
    devices: deviceEntries,
    failures: diagnosticFailures
  }
}

function buildIOSPlatform(ios: Awaited<ReturnType<typeof checkIOS>>, hostSupported: boolean, hostOs: HostOs): PlatformEntry {
  const platformUnsupported = !hostSupported || hostOs === 'linux' || hostOs === 'windows'
  if (platformUnsupported) {
    return {
      status: 'unsupported',
      tools: {},
      providers: {},
      capabilities: {},
      devices: [],
      failures: [
        makeFailure('PLATFORM_UNAVAILABLE', 'ios', 'iOS tooling is only supported on macOS.', {
          tool: null,
          searchedLocations: [],
          selectedProvider: null,
          rawVersion: null,
          remediation: ['Run Mobile Debug MCP on macOS for iOS toolchain discovery.']
        })
      ]
    }
  }

  const xcrunCmd = getXcrunCmd()
  const xcrunProbe = ios.iosAvailable ? probeCommand(xcrunCmd, ['--version']) : { ok: false, raw: null, parsedVersion: null }
  const idbCmd = getIdbCmd()
  const idbProbe = hostSupported && hostOs === 'macos' ? probeIdb(idbCmd) : { ok: false, raw: null, parsedVersion: null }
  const idbCompanionProbe = hostSupported && hostOs === 'macos' ? probeCommand('idb_companion', ['--version']) : { ok: false, raw: null, parsedVersion: null }
  const xcrunTool = makeToolEntry(xcrunCmd, describeXcrunDiscovery(xcrunCmd).discoverySource, xcrunProbe.raw, xcrunProbe.ok ? 'valid' : 'invalid')
  const idbTool = makeToolEntry(idbCmd, describeIdbDiscovery(idbCmd).discoverySource, idbProbe.raw, idbProbe.ok ? 'valid' : 'invalid')
  const idbCompanionTool = makeToolEntry('idb_companion', 'PATH', idbCompanionProbe.raw, idbCompanionProbe.ok ? 'valid' : 'invalid')
  const lldbTool = makeToolEntry('xcrun lldb', 'xcrun', xcrunProbe.raw, xcrunProbe.ok ? 'valid' : 'invalid')

  const simctlAvailable = !!ios.iosAvailable
  const idbAvailable = !!idbProbe.ok
  const bootedDevices = ios.iosDevices > 0
    ? Array.from({ length: ios.iosDevices }, (_, index) => ({
      id: `ios-simulator-${index + 1}`,
      state: 'booted'
    }))
    : []

  const platformUnavailableFailure = !platformUnsupported && !simctlAvailable
    ? makeFailure('PLATFORM_UNAVAILABLE', 'ios', 'iOS tooling is unavailable on this host.', {
      tool: 'xcrun',
      searchedLocations: describeXcrunDiscovery(xcrunCmd).searchedLocations,
      selectedProvider: null,
      rawVersion: xcrunProbe.raw,
      remediation: ['Install Xcode Command Line Tools and ensure xcrun is on PATH.']
    })
    : null

  const deviceFailure = simctlAvailable && !bootedDevices.length
    ? makeFailure('DEVICE_NOT_FOUND', 'ios', 'No iOS simulators are booted.', {
      tool: 'simctl',
      searchedLocations: ['xcrun simctl list devices booted --json'],
      selectedProvider: 'simctl',
      rawVersion: xcrunProbe.raw,
      remediation: ['Boot a simulator in Xcode or via xcrun simctl boot.']
    })
    : null

  const selectedInstallProvider = idbAvailable ? 'idb' : simctlAvailable ? 'simctl' : null
  const selectedDebugProvider = simctlAvailable ? 'LLDB' : null
  const selectedDiscoveryProvider = idbAvailable ? 'idb' : simctlAvailable ? 'simctl' : null

  const status: PlatformStatus = platformUnsupported
    ? 'unsupported'
    : !simctlAvailable
      ? 'unavailable'
      : !bootedDevices.length
        ? 'partially_ready'
        : 'ready'

  const iosFailure = platformUnsupported
    ? makeFailure('PLATFORM_UNAVAILABLE', 'ios', 'iOS tooling is only supported on macOS.', {
      tool: null,
      searchedLocations: [],
      selectedProvider: null,
      rawVersion: null,
      remediation: ['Run Mobile Debug MCP on macOS for iOS toolchain discovery.']
    })
    : platformUnavailableFailure ?? deviceFailure ?? null

  const failureList = [iosFailure].filter((value): value is DiagnosticFailure => value !== null)

  return {
    status,
    tools: {
      xcrun: xcrunTool,
      idb: idbTool,
      idb_companion: idbCompanionTool,
      lldb: lldbTool
    },
    providers: {
      idb: { available: idbAvailable, selected: selectedInstallProvider === 'idb', tool: 'idb' },
      simctl: { available: simctlAvailable, selected: selectedInstallProvider === 'simctl', tool: 'xcrun' },
      lldb: { available: simctlAvailable, selected: selectedDebugProvider === 'LLDB', tool: 'xcrun' }
    },
    capabilities: {
      device_discovery: {
        availability: !!selectedDiscoveryProvider,
        selectedProvider: selectedDiscoveryProvider,
        blockingFailure: selectedDiscoveryProvider ? null : iosFailure
      },
      install_app: {
        availability: !!selectedInstallProvider && bootedDevices.length > 0,
        selectedProvider: selectedInstallProvider,
        blockingFailure: selectedInstallProvider && bootedDevices.length > 0 ? null : deviceFailure ?? iosFailure
      },
      launch_app: {
        availability: !!selectedInstallProvider && bootedDevices.length > 0,
        selectedProvider: selectedInstallProvider,
        blockingFailure: selectedInstallProvider && bootedDevices.length > 0 ? null : deviceFailure ?? iosFailure
      },
      ui_interaction: {
        availability: !!selectedInstallProvider && bootedDevices.length > 0,
        selectedProvider: selectedInstallProvider,
        blockingFailure: selectedInstallProvider && bootedDevices.length > 0 ? null : deviceFailure ?? iosFailure
      },
      screenshot: {
        availability: !!selectedInstallProvider && bootedDevices.length > 0,
        selectedProvider: selectedInstallProvider,
        blockingFailure: selectedInstallProvider && bootedDevices.length > 0 ? null : deviceFailure ?? iosFailure
      },
      log_capture: {
        availability: simctlAvailable && bootedDevices.length > 0,
        selectedProvider: simctlAvailable ? 'simctl' : null,
        blockingFailure: simctlAvailable && bootedDevices.length > 0 ? null : deviceFailure ?? iosFailure
      },
      debug: {
        availability: !!selectedDebugProvider,
        selectedProvider: selectedDebugProvider,
        blockingFailure: selectedDebugProvider ? null : iosFailure
      }
    },
    devices: bootedDevices,
    failures: failureList
  }
}

function buildLegacySummary(androidStatus: PlatformEntry, iosStatus: PlatformEntry, gradle: Awaited<ReturnType<typeof checkGradle>>) {
  const androidReady = androidStatus.status === 'ready'
  const iosReady = iosStatus.status === 'ready'
  const gradleReady = (gradle.issues || []).length === 0
  const overallStatus = (androidReady || iosReady || gradleReady)
    ? ((androidReady && iosReady && gradleReady) ? 'ready' : 'degraded')
    : 'blocked'

  return {
    overall: overallStatus,
    android: {
      ready: androidReady,
      summary: androidStatus.status === 'ready'
        ? `${androidStatus.devices.length} Android device(s) connected; log access available`
        : androidStatus.status === 'partially_ready'
          ? 'Android toolchain available but device-dependent capabilities are limited'
          : androidStatus.status === 'unsupported'
            ? 'Android unsupported on this host'
            : 'ADB unavailable',
      blockers: androidStatus.failures.map((failure) => failure.message)
    },
    ios: {
      ready: iosReady,
      summary: iosStatus.status === 'ready'
        ? `${iosStatus.devices.length} iOS simulator(s) booted`
        : iosStatus.status === 'partially_ready'
          ? 'iOS toolchain available but device-dependent capabilities are limited'
          : iosStatus.status === 'unsupported'
            ? 'iOS unsupported on this host'
            : 'xcrun unavailable',
      blockers: iosStatus.failures.map((failure) => failure.message)
    },
    gradle: {
      ready: gradleReady,
      summary: !gradle.gradleJavaHome
        ? 'No explicit Gradle JDK override detected'
        : gradleReady
          ? `Gradle JDK configured at ${gradle.gradleJavaHome}`
          : `Gradle JDK override invalid: ${gradle.gradleJavaHome}`,
      blockers: gradle.issues || [],
      suggestedFixes: gradle.suggestedFixes || []
    }
  }
}

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

    const javaHome = gradle.gradleJavaHome || (await detectJavaHome().catch(() => undefined))
    const javaBin = javaHome ? resolveJavaBinaryPath(javaHome, hostOs) : null
    const javaProbe = javaBin ? probeCommand(javaBin, ['-version']) : { ok: false, raw: null, parsedVersion: null }
    const javaTool = makeToolEntry(
      javaBin,
      describeJavaDiscovery(javaHome ?? null).discoverySource,
      javaProbe.raw,
      javaProbe.ok ? 'valid' : (javaHome ? 'invalid' : 'missing')
    )

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
