import { promises as fsPromises, existsSync } from 'fs'
import path from 'path'
import { detectJavaHome } from '../java.js'
import { checkGradle } from '../../system/gradle.js'
import { resolveAdbCmd } from './commands.js'
export type GradleEnvOverrides = Record<string, string | undefined>

export function mergeEnv(overrides?: GradleEnvOverrides) {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  for (const [key, value] of Object.entries(overrides || {})) {
    if (typeof value === 'string') env[key] = value
  }
  return env
}

export async function prepareGradle(projectPath: string, envOverrides: GradleEnvOverrides = {}): Promise<{ execCmd: string, gradleArgs: string[], spawnOpts: import('node:child_process').SpawnOptions }> {
  const env = mergeEnv(envOverrides)
  const gradlewPath = path.join(projectPath, 'gradlew')
  const gradleCmd = existsSync(gradlewPath) ? './gradlew' : 'gradle'
  const execCmd = existsSync(gradlewPath) ? gradlewPath : gradleCmd

  // Start with a default task; callers may append/override via env flags
  const gradleArgs: string[] = [env.MCP_GRADLE_TASK || 'assembleDebug']

  // Respect generic MCP_BUILD_JOBS and Android-specific MCP_GRADLE_WORKERS
  const workers = env.MCP_GRADLE_WORKERS || env.MCP_BUILD_JOBS
  if (workers) {
    gradleArgs.push(`--max-workers=${workers}`)
  }

  // Respect gradle cache env: default enabled; set MCP_GRADLE_CACHE=0 to disable
  if (env.MCP_GRADLE_CACHE === '0') {
    gradleArgs.push('-Dorg.gradle.caching=false')
  }

  const detectedJavaHome = await detectJavaHome().catch(() => undefined)
  // Check for problematic org.gradle.java.home entries (env or properties) and avoid passing invalid values to Gradle
  let gradleCheck
  try {
    gradleCheck = await checkGradle()
  } catch {
    gradleCheck = { gradleJavaHome: undefined, gradleValid: false, filesChecked: [], issues: [] }
  }

  // Ensure child processes can find Android platform-tools (adb, etc.) by
  // prepending the platform-tools directory to PATH for spawned processes.
  const adbPath = resolveAdbCmd()
  let platformToolsDir: string | undefined = undefined
  try {
    if (adbPath && adbPath !== 'adb' && existsSync(adbPath)) {
      platformToolsDir = path.dirname(adbPath)
    }
  } catch (e: unknown) { console.debug(`[prepareGradle] error resolving adbPath: ${String(e)}`) }

  const pathParts: string[] = []
  configureJava(env, gradleArgs, pathParts, detectedJavaHome, gradleCheck)

  configurePlatformTools(env, pathParts, platformToolsDir)

  if (pathParts.length > 0) {
    env.PATH = `${pathParts.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`
  }

  try { delete env.SHELL } catch (e: unknown) { console.debug('[prepareGradle] failed to delete SHELL from env:', String(e)) }

  const useWrapper = existsSync(gradlewPath)
  const spawnOpts: import('node:child_process').SpawnOptions = { cwd: projectPath, env }
  if (useWrapper) {
    try { await fsPromises.chmod(gradlewPath, 0o755) } catch (e: unknown) { console.debug('[prepareGradle] chmod failed for gradlew:', String(e)) }
    // Execute the wrapper directly without a shell to avoid shell tokenization of args (spaces in paths)
    spawnOpts.shell = false
  } else {
    // Prefer executing gradle directly without invoking a shell to preserve argument boundaries
    spawnOpts.shell = false
  }

  return { execCmd, gradleArgs, spawnOpts }
}

function configureJava(env: Record<string, string>, gradleArgs: string[], pathParts: string[], detectedJavaHome: string | undefined, gradleCheck: { gradleJavaHome?: string; gradleValid: boolean }) {
  // Prefer a detected (validated) Java home from the system/IDE
  if (detectedJavaHome) {
    if (env.JAVA_HOME !== detectedJavaHome) {
      env.JAVA_HOME = detectedJavaHome
    }
    const javaBin = path.join(detectedJavaHome, 'bin')
    pathParts.push(javaBin)
    gradleArgs.push(`-Dorg.gradle.java.home=${detectedJavaHome}`)
    gradleArgs.push('--no-daemon')
    env.GRADLE_JAVA_HOME = detectedJavaHome
  } else if (gradleCheck && gradleCheck.gradleJavaHome) {
    // There's an org.gradle.java.home configured somewhere (env or gradle.properties)
    if (gradleCheck.gradleValid) {
      const p = gradleCheck.gradleJavaHome as string
      const javaBin = path.join(p, 'bin')
      if (!env.PATH || !env.PATH.includes(javaBin)) pathParts.push(javaBin)
      gradleArgs.push(`-Dorg.gradle.java.home=${p}`)
      gradleArgs.push('--no-daemon')
      env.GRADLE_JAVA_HOME = p
    } else {
      // Invalid gradle java home detected: avoid passing it to Gradle and remove from spawn env
      console.debug(`[prepareGradle] Invalid org.gradle.java.home detected (${gradleCheck.gradleJavaHome}); removing from spawn env to avoid Gradle error.`)
      try { delete env.GRADLE_JAVA_HOME } catch { }
    }
  }

}

function configurePlatformTools(env: Record<string, string>, pathParts: string[], platformToolsDir: string | undefined) {
  if (platformToolsDir) {
    // Prepend platform-tools so gradle and child tools find adb without modifying global env
    if (!env.PATH || !env.PATH.includes(platformToolsDir)) {
      pathParts.push(platformToolsDir)
    }
  } else if (process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME) {
    const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || ''
    const candidate = path.join(sdkRoot, 'platform-tools')
    if (existsSync(candidate) && (!env.PATH || !env.PATH.includes(candidate))) {
      pathParts.push(candidate)
    }
  } else {
    // also try common user sdk location
    const homeSdkTools = path.join(process.env.HOME || '', 'Library', 'Android', 'sdk', 'platform-tools')
    if (existsSync(homeSdkTools) && (!env.PATH || !env.PATH.includes(homeSdkTools))) {
      pathParts.push(homeSdkTools)
    }
  }

}
