import { checkAndroid } from './android.js'
import { checkIOS } from './ios.js'
import { checkGradle } from './gradle.js'
import { ToolsNetwork } from '../network/index.js'

export async function getSystemStatus() {
  try {
    const android = await checkAndroid()
    const ios = await checkIOS()
    const gradle = await checkGradle()
    const networkCapture = await ToolsNetwork.getNetworkCaptureStatusHandler()
    const networkCertificate = await ToolsNetwork.getNetworkCertificateStatusHandler()
    const issues = [...android.issues, ...ios.issues, ...(gradle.issues || [])]

    const success = issues.length === 0
    return {
      success,
      adbAvailable: android.adbAvailable,
      adbVersion: android.adbVersion,
      devices: android.devices,
      deviceStates: android.deviceStates,
      logsAvailable: android.logsAvailable,
      envValid: android.envValid,
      issues,
      appInstalled: android.appInstalled,
      iosAvailable: ios.iosAvailable,
      iosDevices: ios.iosDevices,
      networkCapture,
      networkCertificate,
      gradleJavaHome: gradle.gradleJavaHome,
      gradleValid: gradle.gradleValid,
      gradleFilesChecked: gradle.filesChecked,
      gradleSuggestedFixes: gradle.suggestedFixes
    }
  } catch (e: unknown) {
    return { success: false, issues: ['Internal error: ' + (e instanceof Error ? e.message : String(e))] }
  }
}
