import { resolveTargetDevice } from '../resolve-device.js'
import { AndroidInteract } from '../android/interact.js'
import { iOSInteract } from '../ios/interact.js'

const androidInteract = new AndroidInteract()
const iosInteract = new iOSInteract()

export async function startAppHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
    return await androidInteract.startApp(appId, resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
    return await iosInteract.startApp(appId, resolved.id)
  }
}

export async function terminateAppHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
    return await androidInteract.terminateApp(appId, resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
    return await iosInteract.terminateApp(appId, resolved.id)
  }
}

export async function restartAppHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
    return await androidInteract.restartApp(appId, resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
    return await iosInteract.restartApp(appId, resolved.id)
  }
}

export async function resetAppDataHandler({ platform, appId, deviceId }: { platform: 'android' | 'ios', appId: string, deviceId?: string }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', appId, deviceId })
    return await androidInteract.resetAppData(appId, resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', appId, deviceId })
    return await iosInteract.resetAppData(appId, resolved.id)
  }
}
