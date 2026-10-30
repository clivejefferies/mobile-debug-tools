import type { HostOs } from './model.js'
import { makeFailure } from './probes.js'

export function buildUnsupportedHostStatus(hostOs: HostOs) {
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
