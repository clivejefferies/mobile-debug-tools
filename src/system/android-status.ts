import { checkAndroid } from './android.js'
import { resolveAdbCmd } from '../utils/android/utils.js'
import type { PlatformStatus, DiagnosticFailure, PlatformEntry } from './model.js'
import { makeFailure, makeToolEntry, describeAdbDiscovery } from './probes.js'

export function buildAndroidPlatform(android: Awaited<ReturnType<typeof checkAndroid>>, hostSupported: boolean): PlatformEntry {
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
  const { envFailure, adbFailure, deviceFailure, diagnosticFailures } = androidFailures(android, adbAvailable, adbDiscovery)
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
    capabilities: androidCapabilities(adbAvailable, installAvailable, logAvailable, diagnosticFailures, deviceFailure, adbFailure, envFailure),
    devices: deviceEntries,
    failures: diagnosticFailures
  }
}

function androidFailures(android: Awaited<ReturnType<typeof checkAndroid>>, adbAvailable: boolean, adbDiscovery: ReturnType<typeof describeAdbDiscovery>) {
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

  return { envFailure, adbFailure, deviceFailure, diagnosticFailures }
}

function androidCapabilities(adbAvailable: boolean, installAvailable: boolean, logAvailable: boolean, diagnosticFailures: DiagnosticFailure[], deviceFailure: DiagnosticFailure | null, adbFailure: DiagnosticFailure | null, envFailure: DiagnosticFailure | null): PlatformEntry['capabilities'] {
  const applicationCapability = {
    availability: installAvailable,
    selectedProvider: installAvailable ? 'adb' : null,
    blockingFailure: installAvailable ? null : deviceFailure ?? adbFailure ?? envFailure
  }
  return {
    device_discovery: {
      availability: adbAvailable,
      selectedProvider: adbAvailable ? 'adb' : null,
      blockingFailure: adbAvailable ? null : diagnosticFailures[0] ?? null
    },
    install_app: { ...applicationCapability },
    launch_app: { ...applicationCapability },
    ui_interaction: { ...applicationCapability },
    screenshot: { ...applicationCapability },
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
  }
}
