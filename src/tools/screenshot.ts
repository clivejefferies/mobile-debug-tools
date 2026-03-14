import { resolveTargetDevice } from '../resolve-device.js'
import { AndroidObserve } from '../android/observe.js'
import { iOSObserve } from '../ios/observe.js'

const androidObserve = new AndroidObserve()
const iosObserve = new iOSObserve()

export async function captureScreenshotHandler({ platform, deviceId }: { platform: 'android' | 'ios', deviceId?: string }) {
  if (platform === 'android') {
    const resolved = await resolveTargetDevice({ platform: 'android', deviceId })
    const result = await androidObserve.captureScreen(resolved.id)
    return { device: resolved, resolution: result.resolution, screenshot: result.screenshot }
  } else {
    const resolved = await resolveTargetDevice({ platform: 'ios', deviceId })
    const result = await iosObserve.captureScreenshot(resolved.id)
    return { device: resolved, resolution: result.resolution, screenshot: result.screenshot }
  }
}
