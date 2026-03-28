import { readFileSync, existsSync } from 'fs'
import path from 'path'
import os from 'os'

function readPropertiesFile(p: string): Record<string,string> {
  try {
    const txt = readFileSync(p, { encoding: 'utf8' })
    const lines = String(txt).split(/\r?\n/)
    const out: Record<string,string> = {}
    for (const l of lines) {
      const trimmed = l.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const k = trimmed.substring(0, idx).trim()
      const v = trimmed.substring(idx+1).trim()
      out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function javaBinExists(p?: string): boolean {
  if (!p) return false
  try {
    const javaPath = path.join(p, 'bin', 'java')
    if (existsSync(javaPath)) return true
    const alt = path.join(p, 'Contents', 'Home', 'bin', 'java')
    if (existsSync(alt)) return true
    return false
  } catch { return false }
}

export async function checkGradle(): Promise<{ gradleJavaHome?: string; gradleValid: boolean; filesChecked: string[]; issues: string[]; suggestedFixes?: string[] }> {
  const issues: string[] = []
  const filesChecked: string[] = []
  const suggestedFixes: string[] = []
  let gradleJavaHome: string | undefined

  // 1) explicit env
  if (process.env.GRADLE_JAVA_HOME) {
    gradleJavaHome = process.env.GRADLE_JAVA_HOME
    if (!javaBinExists(gradleJavaHome)) {
      issues.push(`GRADLE_JAVA_HOME is set to '${gradleJavaHome}' but no java binary was found there`)
      suggestedFixes.push('Unset GRADLE_JAVA_HOME or point it to a valid JDK (e.g., /Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home)')
    }
  }

  // 2) user gradle.properties
  const gradleUserHome = process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle')
  const userProps = path.join(gradleUserHome, 'gradle.properties')
  filesChecked.push(userProps)
  try {
    const props = readPropertiesFile(userProps)
    if (props['org.gradle.java.home']) {
      const p = props['org.gradle.java.home']
      gradleJavaHome = gradleJavaHome || p
      if (!javaBinExists(p)) {
        issues.push(`org.gradle.java.home in ${userProps} points to '${p}' which does not look like a valid JDK`)
        suggestedFixes.push(`Edit ${userProps} to remove or correct org.gradle.java.home`)
      }
    }
  } catch { }

  // 3) system gradle.properties
  const systemProps = '/etc/gradle/gradle.properties'
  filesChecked.push(systemProps)
  try {
    const props = readPropertiesFile(systemProps)
    if (props['org.gradle.java.home']) {
      const p = props['org.gradle.java.home']
      gradleJavaHome = gradleJavaHome || p
      if (!javaBinExists(p)) {
        issues.push(`org.gradle.java.home in ${systemProps} points to '${p}' which does not look like a valid JDK`)
        suggestedFixes.push(`Edit ${systemProps} to remove or correct org.gradle.java.home`)
      }
    }
  } catch { }

  // 4) GRADLE_HOME fallback
  if (!gradleJavaHome && process.env.GRADLE_HOME) {
    filesChecked.push(process.env.GRADLE_HOME)
    if (javaBinExists(process.env.GRADLE_HOME)) {
      gradleJavaHome = process.env.GRADLE_HOME
    }
  }

  const gradleValid = !!gradleJavaHome && javaBinExists(gradleJavaHome)
  if (!gradleJavaHome) {
    // no explicit gradle java home detected — not an issue
  } else if (!gradleValid) {
    issues.push(`Detected org.gradle.java.home = '${gradleJavaHome}' but it is invalid`)
  }

  return { gradleJavaHome, gradleValid, filesChecked, issues, suggestedFixes }
}
