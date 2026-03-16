import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import path from 'path'
import { existsSync } from 'fs'
import { execAdb, spawnAdb, getAndroidDeviceMetadata, getDeviceInfo } from './utils.js'
import { detectJavaHome } from '../utils/java.js'

export class AndroidManage {
  async build(projectPath: string, _variant?: string): Promise<{ artifactPath: string, output?: string } | { error: string }> {
    void _variant
    try {
      const { prepareGradle } = await import('./utils.js').catch(() => ({ prepareGradle: undefined })) as any
      if (prepareGradle && typeof prepareGradle === 'function') {
        const { execCmd, gradleArgs, spawnOpts } = await prepareGradle(projectPath)
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(execCmd, gradleArgs, spawnOpts)
          let stderr = ''
          proc.stderr?.on('data', d => stderr += d.toString())
          proc.on('close', code => {
            if (code === 0) resolve()
            else reject(new Error(stderr || `Gradle failed with code ${code}`))
          })
          proc.on('error', err => reject(err))
        })
      } else {
        const gradlewPath = path.join(projectPath, 'gradlew')
        const gradleCmd = existsSync(gradlewPath) ? './gradlew' : 'gradle'
        const execCmd = existsSync(gradlewPath) ? gradlewPath : gradleCmd
        const gradleArgs = ['assembleDebug']
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(execCmd, gradleArgs, { cwd: projectPath, shell: existsSync(gradlewPath) ? false : true })
          let stderr = ''
          proc.stderr?.on('data', d => stderr += d.toString())
          proc.on('close', code => {
            if (code === 0) resolve()
            else reject(new Error(stderr || `Gradle failed with code ${code}`))
          })
          proc.on('error', err => reject(err))
        })
      }
      async function findApk(dir: string): Promise<string | undefined> {
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            const found = await findApk(full)
            if (found) return found
          } else if (e.isFile() && full.endsWith('.apk')) {
            return full
          }
        }
        return undefined
      }
      const apk = await findApk(projectPath)
      if (!apk) return { error: 'Could not find APK after build' }
      return { artifactPath: apk }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  async installApp(apkPath: string, deviceId?: string): Promise<any> {
    const metadata = await getAndroidDeviceMetadata('', deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

    async function findApk(dir: string): Promise<string | undefined> {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          const found = await findApk(full)
          if (found) return found
        } else if (e.isFile() && full.endsWith('.apk')) {
          return full
        }
      }
      return undefined
    }

    try {
      let apkToInstall = apkPath
      const stat = await fs.stat(apkPath).catch(() => null)
      if (stat && stat.isDirectory()) {
        const detectedJavaHome = await detectJavaHome().catch(() => undefined)
        const env = Object.assign({}, process.env)
        if (detectedJavaHome) {
          if (env.JAVA_HOME !== detectedJavaHome) {
            env.JAVA_HOME = detectedJavaHome
            env.PATH = `${path.join(detectedJavaHome, 'bin')}${path.delimiter}${env.PATH || ''}`
            console.debug('[android-run] Overriding JAVA_HOME with detected path:', detectedJavaHome)
          }
        }
        try { delete env.SHELL } catch {}

        const gradleArgs = ['assembleDebug']
        if (detectedJavaHome) {
          gradleArgs.push(`-Dorg.gradle.java.home=${detectedJavaHome}`)
          gradleArgs.push('--no-daemon')
          env.GRADLE_JAVA_HOME = detectedJavaHome
        }

        const wrapperPath = path.join(apkPath, 'gradlew')
        const useWrapper = existsSync(wrapperPath)
        const execCmd = useWrapper ? wrapperPath : 'gradle'
        const spawnOpts: any = { cwd: apkPath, env }
        if (useWrapper) {
          await fs.chmod(wrapperPath, 0o755).catch(() => {})
          spawnOpts.shell = false
        } else spawnOpts.shell = true

        const proc = spawn(execCmd, gradleArgs, spawnOpts)
        let stderr = ''
        await new Promise<void>((resolve, reject) => {
          proc.stderr?.on('data', d => stderr += d.toString())
          proc.on('close', code => {
            if (code === 0) resolve()
            else reject(new Error(stderr || `Gradle build failed with code ${code}`))
          })
          proc.on('error', err => reject(err))
        })

        const built = await findApk(apkPath)
        if (!built) throw new Error('Could not locate built APK after running Gradle')
        apkToInstall = built
      }

      try {
        const res = await spawnAdb(['install', '-r', apkToInstall], deviceId)
        if (res.code === 0) {
          return { device: deviceInfo, installed: true, output: res.stdout }
        }
      } catch (e) {
        console.debug('[android-run] adb install failed, attempting push+pm fallback:', e instanceof Error ? e.message : String(e))
      }

      const basename = path.basename(apkToInstall)
      const remotePath = `/data/local/tmp/${basename}`
      await execAdb(['push', apkToInstall, remotePath], deviceId)
      const pmOut = await execAdb(['shell', 'pm', 'install', '-r', remotePath], deviceId)
      try { await execAdb(['shell', 'rm', remotePath], deviceId) } catch {}
      return { device: deviceInfo, installed: true, output: pmOut }
    } catch (e) {
      return { device: deviceInfo, installed: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async startApp(appId: string, deviceId?: string): Promise<any> {
    const metadata = await getAndroidDeviceMetadata(appId, deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)
    await execAdb(['shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1'], deviceId)
    return { device: deviceInfo, appStarted: true, launchTimeMs: 1000 }
  }

  async terminateApp(appId: string, deviceId?: string): Promise<any> {
    const metadata = await getAndroidDeviceMetadata(appId, deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)
    await execAdb(['shell', 'am', 'force-stop', appId], deviceId)
    return { device: deviceInfo, appTerminated: true }
  }

  async restartApp(appId: string, deviceId?: string): Promise<any> {
    await this.terminateApp(appId, deviceId)
    const startResult = await this.startApp(appId, deviceId)
    return {
      device: startResult.device,
      appRestarted: startResult.appStarted,
      launchTimeMs: startResult.launchTimeMs
    }
  }

  async resetAppData(appId: string, deviceId?: string): Promise<any> {
    const metadata = await getAndroidDeviceMetadata(appId, deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)
    const output = await execAdb(['shell', 'pm', 'clear', appId], deviceId)
    return { device: deviceInfo, dataCleared: output === 'Success' }
  }
}
