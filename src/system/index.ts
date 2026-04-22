import { checkAndroid } from './android.js'
import { checkIOS } from './ios.js'
import { checkGradle } from './gradle.js'

export async function getSystemStatus() {
  try {
    const android = await checkAndroid()
    const ios = await checkIOS()
    const gradle = await checkGradle()
    const issues = [...android.issues, ...ios.issues, ...(gradle.issues || [])]

    const success = issues.length === 0
    const androidReady = android.adbAvailable && android.devices > 0 && !android.issues.some((issue) => /unauthorized|offline/i.test(issue))
    const iosReady = ios.iosAvailable && ios.iosDevices > 0
    const gradleReady = (gradle.issues || []).length === 0
    const overallStatus = success ? 'ready' : (androidReady || iosReady ? 'degraded' : 'blocked')

    const androidSummary = !android.adbAvailable
      ? 'ADB unavailable'
      : android.devices === 0
        ? 'ADB available but no Android devices connected'
        : android.logsAvailable
          ? `${android.devices} Android device(s) connected; log access available`
          : `${android.devices} Android device(s) connected; log access unavailable`

    const iosSummary = !ios.iosAvailable
      ? 'xcrun unavailable'
      : ios.iosDevices === 0
        ? 'xcrun available but no iOS simulators booted'
        : `${ios.iosDevices} iOS simulator(s) booted`

    const gradleSummary = !gradle.gradleJavaHome
      ? 'No explicit Gradle JDK override detected'
      : gradleReady
        ? `Gradle JDK configured at ${gradle.gradleJavaHome}`
        : `Gradle JDK override invalid: ${gradle.gradleJavaHome}`

    return {
      success,
      status: overallStatus,
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
      gradleJavaHome: gradle.gradleJavaHome,
      gradleValid: gradle.gradleValid,
      gradleFilesChecked: gradle.filesChecked,
      gradleSuggestedFixes: gradle.suggestedFixes,
      summary: {
        overall: overallStatus,
        android: {
          ready: androidReady,
          summary: androidSummary,
          blockers: android.issues
        },
        ios: {
          ready: iosReady,
          summary: iosSummary,
          blockers: ios.issues
        },
        gradle: {
          ready: gradleReady,
          summary: gradleSummary,
          blockers: gradle.issues || [],
          suggestedFixes: gradle.suggestedFixes || []
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
