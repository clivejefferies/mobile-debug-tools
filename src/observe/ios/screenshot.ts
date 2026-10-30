import { encodeScreenshot } from '../screenshot-encoding.js'
import { randomUUID } from 'node:crypto'
import { promises as fs } from "fs"
import { CaptureIOSScreenshotResponse } from "../../types.js"
import { getIOSDeviceMetadata } from "../../utils/ios/utils.js"
import { parsePngSize } from '../../utils/image.js'
import { iosExecCommand } from './context.js'
export async function collectCaptureScreenshot(deviceId: string = "booted"): Promise<CaptureIOSScreenshotResponse> {
  const device = await getIOSDeviceMetadata(deviceId)
  const tmpFile = `/tmp/mcp-ios-screenshot-${randomUUID()}.png`

  try {
    await iosExecCommand(['simctl', 'io', deviceId, 'screenshot', tmpFile], deviceId)

    const buffer = await fs.readFile(tmpFile)

    const dims = parsePngSize(buffer)

    const encoded = await encodeScreenshot(buffer, 'ios')
    await fs.rm(tmpFile).catch(() => { })
    return { device, ...encoded, resolution: { width: dims.width, height: dims.height } }
  } catch (e) {
    await fs.rm(tmpFile).catch(() => { })
    throw new Error(`Failed to capture screenshot: ${e instanceof Error ? e.message : String(e)}`)
  }
}
