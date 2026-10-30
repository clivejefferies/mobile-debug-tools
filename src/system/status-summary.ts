import { checkGradle } from './gradle.js'
import type { PlatformEntry } from './model.js'

export function buildLegacySummary(androidStatus: PlatformEntry, iosStatus: PlatformEntry, gradle: Awaited<ReturnType<typeof checkGradle>>) {
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
