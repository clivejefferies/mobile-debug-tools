import { checkIOS } from './ios.js'
import { getIdbCmd, getXcrunCmd } from '../utils/ios/utils.js'
import { probeIdb } from '../utils/cli/idb/idb-helper.js'
import type { HostOs, PlatformStatus, DiagnosticFailure, PlatformEntry } from './model.js'
import { probeCommand, makeFailure, makeToolEntry, describeXcrunDiscovery, describeIdbDiscovery } from './probes.js'

export function buildIOSPlatform(ios: Awaited<ReturnType<typeof checkIOS>>, hostSupported: boolean, hostOs: HostOs): PlatformEntry {
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

  const { xcrunCmd, xcrunProbe, idbProbe, xcrunTool, idbTool, idbCompanionTool, lldbTool } = iosTools(ios, hostSupported, hostOs)
  const simctlAvailable = !!ios.iosAvailable
  const idbAvailable = !!idbProbe.ok
  const bootedDevices = ios.iosDevices > 0
    ? Array.from({ length: ios.iosDevices }, (_, index) => ({
      id: `ios-simulator-${index + 1}`,
      state: 'booted'
    }))
    : []

  const { platformUnavailableFailure, deviceFailure } = iosFailures(platformUnsupported, simctlAvailable, bootedDevices.length, xcrunCmd, xcrunProbe.raw)
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
    capabilities: iosCapabilities(selectedDiscoveryProvider, selectedInstallProvider, selectedDebugProvider, simctlAvailable, bootedDevices.length, deviceFailure, iosFailure),
    devices: bootedDevices,
    failures: failureList
  }
}

function iosTools(ios: Awaited<ReturnType<typeof checkIOS>>, hostSupported: boolean, hostOs: HostOs) {
  const xcrunCmd = getXcrunCmd()
  const xcrunProbe = ios.iosAvailable ? probeCommand(xcrunCmd, ['--version']) : { ok: false, raw: null, parsedVersion: null }
  const idbCmd = getIdbCmd()
  const idbProbe = hostSupported && hostOs === 'macos' ? probeIdb(idbCmd) : { ok: false, raw: null, parsedVersion: null }
  const idbCompanionProbe = hostSupported && hostOs === 'macos' ? probeCommand('idb_companion', ['--version']) : { ok: false, raw: null, parsedVersion: null }
  const xcrunTool = makeToolEntry(xcrunCmd, describeXcrunDiscovery(xcrunCmd).discoverySource, xcrunProbe.raw, xcrunProbe.ok ? 'valid' : 'invalid')
  const idbTool = makeToolEntry(idbCmd, describeIdbDiscovery(idbCmd).discoverySource, idbProbe.raw, idbProbe.ok ? 'valid' : 'invalid')
  const idbCompanionTool = makeToolEntry('idb_companion', 'PATH', idbCompanionProbe.raw, idbCompanionProbe.ok ? 'valid' : 'invalid')
  const lldbTool = makeToolEntry('xcrun lldb', 'xcrun', xcrunProbe.raw, xcrunProbe.ok ? 'valid' : 'invalid')

  return { xcrunCmd, xcrunProbe, idbProbe, xcrunTool, idbTool, idbCompanionTool, lldbTool }
}

function iosFailures(platformUnsupported: boolean, simctlAvailable: boolean, deviceCount: number, xcrunCmd: string, rawVersion: string | null) {
  const platformUnavailableFailure = !platformUnsupported && !simctlAvailable
    ? makeFailure('PLATFORM_UNAVAILABLE', 'ios', 'iOS tooling is unavailable on this host.', {
      tool: 'xcrun',
      searchedLocations: describeXcrunDiscovery(xcrunCmd).searchedLocations,
      selectedProvider: null,
      rawVersion: rawVersion,
      remediation: ['Install Xcode Command Line Tools and ensure xcrun is on PATH.']
    })
    : null

  const deviceFailure = simctlAvailable && !deviceCount
    ? makeFailure('DEVICE_NOT_FOUND', 'ios', 'No iOS simulators are booted.', {
      tool: 'simctl',
      searchedLocations: ['xcrun simctl list devices booted --json'],
      selectedProvider: 'simctl',
      rawVersion: rawVersion,
      remediation: ['Boot a simulator in Xcode or via xcrun simctl boot.']
    })
    : null

  return { platformUnavailableFailure, deviceFailure }
}

function iosCapabilities(selectedDiscoveryProvider: string | null, selectedInstallProvider: string | null, selectedDebugProvider: string | null, simctlAvailable: boolean, deviceCount: number, deviceFailure: DiagnosticFailure | null, iosFailure: DiagnosticFailure | null): PlatformEntry['capabilities'] {
  const applicationCapability = {
    availability: !!selectedInstallProvider && deviceCount > 0,
    selectedProvider: selectedInstallProvider,
    blockingFailure: selectedInstallProvider && deviceCount > 0 ? null : deviceFailure ?? iosFailure
  }
  return {
    device_discovery: {
      availability: !!selectedDiscoveryProvider,
      selectedProvider: selectedDiscoveryProvider,
      blockingFailure: selectedDiscoveryProvider ? null : iosFailure
    },
    install_app: { ...applicationCapability },
    launch_app: { ...applicationCapability },
    ui_interaction: { ...applicationCapability },
    screenshot: { ...applicationCapability },
    log_capture: {
      availability: simctlAvailable && deviceCount > 0,
      selectedProvider: simctlAvailable ? 'simctl' : null,
      blockingFailure: simctlAvailable && deviceCount > 0 ? null : deviceFailure ?? iosFailure
    },
    debug: {
      availability: !!selectedDebugProvider,
      selectedProvider: selectedDebugProvider,
      blockingFailure: selectedDebugProvider ? null : iosFailure
    }
  }
}
