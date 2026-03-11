import { StartAppResponse, TerminateAppResponse, RestartAppResponse, ResetAppDataResponse, WaitForElementResponse, TapResponse } from "../types.js"
import { execAdb, getAndroidDeviceMetadata, getDeviceInfo } from "./utils.js"
import { AndroidObserve } from "./observe.js"

export class AndroidInteract {
  private observe = new AndroidObserve();

  async waitForElement(text: string, timeout: number, deviceId?: string): Promise<WaitForElementResponse> {
    const metadata = await getAndroidDeviceMetadata("", deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const tree = await this.observe.getUITree(deviceId);
        
        if (tree.error) {
          return { device: deviceInfo, found: false, error: tree.error };
        }

        const element = tree.elements.find(e => e.text === text);
        if (element) {
          return { device: deviceInfo, found: true, element };
        }
      } catch (e) {
        // Ignore errors during polling and retry
        console.error("Error polling UI tree:", e);
      }
      
      const elapsed = Date.now() - startTime;
      const remaining = timeout - elapsed;
      if (remaining <= 0) break;
      
      await new Promise(resolve => setTimeout(resolve, Math.min(500, remaining)));
    }
    return { device: deviceInfo, found: false };
  }

  async tap(x: number, y: number, deviceId?: string): Promise<TapResponse> {
    const metadata = await getAndroidDeviceMetadata("", deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

    try {
      await execAdb(['shell', 'input', 'tap', x.toString(), y.toString()], deviceId)
      return { device: deviceInfo, success: true, x, y }
    } catch (e) {
      return { device: deviceInfo, success: false, x, y, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async startApp(appId: string, deviceId?: string): Promise<StartAppResponse> {
    const metadata = await getAndroidDeviceMetadata(appId, deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)
    
    await execAdb(['shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1'], deviceId)
    
    return { device: deviceInfo, appStarted: true, launchTimeMs: 1000 }
  }

  async terminateApp(appId: string, deviceId?: string): Promise<TerminateAppResponse> {
    const metadata = await getAndroidDeviceMetadata(appId, deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

    await execAdb(['shell', 'am', 'force-stop', appId], deviceId)
    
    return { device: deviceInfo, appTerminated: true }
  }

  async restartApp(appId: string, deviceId?: string): Promise<RestartAppResponse> {
    await this.terminateApp(appId, deviceId)
    const startResult = await this.startApp(appId, deviceId)
    return {
      device: startResult.device,
      appRestarted: startResult.appStarted,
      launchTimeMs: startResult.launchTimeMs
    }
  }

  async resetAppData(appId: string, deviceId?: string): Promise<ResetAppDataResponse> {
    const metadata = await getAndroidDeviceMetadata(appId, deviceId)
    const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

    const output = await execAdb(['shell', 'pm', 'clear', appId], deviceId)
    
    return { device: deviceInfo, dataCleared: output === 'Success' }
  }
}
