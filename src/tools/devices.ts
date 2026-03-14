import { listDevices } from '../resolve-device.js'

export async function listDevicesHandler({ platform, appId }: { platform?: 'android' | 'ios', appId?: string }) {
  const devices = await listDevices(platform as any, appId)
  return { devices }
}
