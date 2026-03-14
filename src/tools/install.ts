import { promises as fs } from 'fs'
import path from 'path'
import { resolveTargetDevice } from '../resolve-device.js'
import { AndroidInteract } from '../android/interact.js'
import { iOSInteract } from '../ios/interact.js'

const androidInteract = new AndroidInteract()
const iosInteract = new iOSInteract()

export async function installAppHandler({ platform, appPath, deviceId }: { platform?: 'android' | 'ios', appPath: string, deviceId?: string }) {
  let chosenPlatform: 'android' | 'ios' | undefined = platform

  try {
    const stat = await fs.stat(appPath).catch(() => null)
    if (stat && stat.isDirectory()) {
      const files = (await fs.readdir(appPath).catch(() => [])) as string[]
      if (files.some(f => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'))) {
        chosenPlatform = 'ios'
      } else if (files.includes('gradlew') || files.includes('build.gradle') || files.includes('settings.gradle') || (files.includes('app') && (await fs.stat(path.join(appPath, 'app')).catch(() => null)))) {
        chosenPlatform = 'android'
      } else {
        chosenPlatform = 'android'
      }
    } else if (typeof appPath === 'string') {
      const ext = path.extname(appPath).toLowerCase()
      if (ext === '.apk') chosenPlatform = 'android'
      else if (ext === '.ipa' || ext === '.app') chosenPlatform = 'ios'
      else chosenPlatform = 'android'
    }
  } catch (e) {
    chosenPlatform = 'android'
  }

  if (chosenPlatform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    const result = await androidInteract.installApp(appPath, resolved.id)
    return result
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', deviceId })
    const result = await iosInteract.installApp(appPath, resolved.id)
    return result
  }
}
