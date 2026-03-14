import { resolveTargetDevice } from '../resolve-device.js'
import { AndroidObserve } from '../android/observe.js'
import { iOSObserve } from '../ios/observe.js'
import { AndroidInteract } from '../android/interact.js'
import { iOSInteract } from '../ios/interact.js'

const androidObserve = new AndroidObserve()
const iosObserve = new iOSObserve()
const androidInteract = new AndroidInteract()
const iosInteract = new iOSInteract()

export async function getUITreeHandler({ platform, deviceId }: { platform: 'android' | 'ios', deviceId?: string }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await androidObserve.getUITree(resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', deviceId })
    return await iosObserve.getUITree(resolved.id)
  }
}

export async function getCurrentScreenHandler({ deviceId }: { deviceId?: string }) {
  const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
  return await androidObserve.getCurrentScreen(resolved.id)
}

export async function waitForElementHandler({ platform, text, timeout, deviceId }: { platform: 'android' | 'ios', text: string, timeout?: number, deviceId?: string }) {
  const effectiveTimeout = timeout ?? 10000
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await androidInteract.waitForElement(text, effectiveTimeout, resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', deviceId })
    return await iosInteract.waitForElement(text, effectiveTimeout, resolved.id)
  }
}

export async function tapHandler({ platform, x, y, deviceId }: { platform?: 'android' | 'ios', x: number, y: number, deviceId?: string }) {
  const effectivePlatform = platform || 'android'
  if (effectivePlatform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    return await androidInteract.tap(x, y, resolved.id)
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', deviceId })
    return await iosInteract.tap(x, y, resolved.id)
  }
}

export async function swipeHandler({ x1, y1, x2, y2, duration, deviceId }: { x1: number, y1: number, x2: number, y2: number, duration: number, deviceId?: string }) {
  const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
  return await androidInteract.swipe(x1, y1, x2, y2, duration, resolved.id)
}

export async function typeTextHandler({ text, deviceId }: { text: string, deviceId?: string }) {
  const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
  return await androidInteract.typeText(text, resolved.id)
}

export async function pressBackHandler({ deviceId }: { deviceId?: string }) {
  const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
  return await androidInteract.pressBack(resolved.id)
}
