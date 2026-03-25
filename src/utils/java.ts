import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

function isJavaVersionAcceptable(output?: string | null): boolean {
  if (!output) return false
  const s = String(output)
  // Accept Java 17 or 21 (common supported LTS for Android builds)
  if (/\b17\b/.test(s) || /17\./.test(s)) return true
  if (/\b21\b/.test(s) || /21\./.test(s)) return true
  return false
}

import { spawnSync } from 'child_process'
function javaVersionOf(javaBin: string): string | undefined {
  try {
    const res = spawnSync(javaBin, ['-version'], { encoding: 'utf8' })
    // Java prints version to stderr traditionally
    const out = (res.stdout || '') + (res.stderr || '')
    return out || undefined
  } catch (e: unknown) { console.debug('[javaVersionOf] java -version failed: ' + String(e)); return undefined }
}

export async function detectJavaHome(): Promise<string | undefined> {
  try {
    // 1) Honor explicit ANDROID_STUDIO_JDK env (highest priority)
    const envStudio = process.env.ANDROID_STUDIO_JDK || process.env.ANDROID_STUDIO_JBR
    if (envStudio && existsSync(path.join(envStudio, 'bin', 'java'))) {
      const v = javaVersionOf(path.join(envStudio, 'bin', 'java'))
      if (isJavaVersionAcceptable(v)) {
        console.debug('[java.detect] Using ANDROID_STUDIO_JDK from env:', envStudio)
        return envStudio
      }
      console.debug('[java.detect] ANDROID_STUDIO_JDK present but java -version did not match expected versions')
    }

    // 2) Android Studio JBR candidates (prefer these over JAVA_HOME)
    const jbrCandidates = [
      '/Applications/Android Studio.app/Contents/jbr',
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
      '/Applications/Android Studio Preview.app/Contents/jbr',
      '/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home',
      '/Applications/Android Studio Preview 2022.3.app/Contents/jbr',
      '/Applications/Android Studio Preview 2022.3.app/Contents/jbr/Contents/Home',
      '/Applications/Android Studio Preview 2023.1.app/Contents/jbr',
      '/Applications/Android Studio Preview 2023.1.app/Contents/jbr/Contents/Home'
    ]
    for (const p of jbrCandidates) {
      const javaBin = path.join(p, 'bin', 'java')
      if (existsSync(javaBin)) {
        const v = javaVersionOf(javaBin)
        if (isJavaVersionAcceptable(v)) {
          console.debug('[java.detect] Found Android Studio JBR at:', p)
          return p
        }
      }
    }

    // 3) If JAVA_HOME set, validate it (accept 17 or 21)
    if (process.env.JAVA_HOME) {
      try {
        const javaBin = path.join(process.env.JAVA_HOME, 'bin', 'java')
        const v = javaVersionOf(javaBin)
        if (isJavaVersionAcceptable(v)) {
          console.debug('[java.detect] Using JAVA_HOME from env:', process.env.JAVA_HOME)
          return process.env.JAVA_HOME
        }
        console.debug('[java.detect] Existing JAVA_HOME does not appear to be acceptable Java (17/21), will search')
      } catch {
        console.debug('[java.detect] Failed to validate existing JAVA_HOME, searching for JDK')
      }
    }

    // 4) macOS explicit path for JDK 17
    const explicit = '/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home'
    if (existsSync(explicit)) return explicit

    // 5) macOS /usr/libexec/java_home try supported versions
    try {
      const out17 = execSync('/usr/libexec/java_home -v 17', { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
      if (out17) return out17
    } catch (e: unknown) { console.debug('[java.detect] /usr/libexec/java_home -v 17 failed: ' + String(e)) }
    try {
      const out21 = execSync('/usr/libexec/java_home -v 21', { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
      if (out21) return out21
    } catch (e: unknown) { console.debug('[java.detect] /usr/libexec/java_home -v 21 failed: ' + String(e)) }

    // 6) macOS common JDK locations
    try {
      const homes = execSync('ls -1 /Library/Java/JavaVirtualMachines || true', { stdio: ['ignore', 'pipe', 'inherit'] }).toString().split(/\r?\n/).filter(Boolean)
      for (const h of homes) {
        if (h.toLowerCase().includes('17') || h.toLowerCase().includes('jdk-17') || h.toLowerCase().includes('21') || h.toLowerCase().includes('jdk-21')) {
          const candidate = `/Library/Java/JavaVirtualMachines/${h}/Contents/Home`
          return candidate
        }
      }
    } catch (e: unknown) { console.debug('[java.detect] listing /Library/Java/JavaVirtualMachines failed: ' + String(e)) }

    // 7) Linux locations
    const linuxCandidates = [
      '/usr/lib/jvm/java-17-openjdk-amd64',
      '/usr/lib/jvm/java-17-openjdk',
      '/usr/lib/jvm/zulu17',
      '/usr/lib/jvm/temurin-17-jdk',
      '/usr/lib/jvm/temurin-21-jdk',
      '/usr/lib/jvm/java-21-openjdk-amd64'
    ]
    for (const p of linuxCandidates) {
      try { if (existsSync(p)) return p } catch (e: unknown) { console.debug(`[java.detect] checking linux candidate ${p} failed: ${String(e)}`) }
    }
  } catch (e: unknown) {
    console.debug('[java.detect] error detecting java home:', e instanceof Error ? e.message : String(e))
  }
  return undefined
}
