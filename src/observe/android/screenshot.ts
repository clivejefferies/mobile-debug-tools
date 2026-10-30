import { encodeScreenshot } from '../screenshot-encoding.js'
import { spawn } from "child_process"
import { CaptureAndroidScreenResponse, DeviceInfo } from "../../types.js"
import { getAdbCmd, execAdb, getAndroidDeviceMetadata, getDeviceInfo } from "../../utils/android/utils.js"
import { parsePngSize } from "../../utils/image.js"
export async function collectCaptureScreen(deviceId?: string): Promise<CaptureAndroidScreenResponse> {
  const metadata = await getAndroidDeviceMetadata("", deviceId)
  const deviceInfo: DeviceInfo = getDeviceInfo(deviceId || 'default', metadata)

  return new Promise((resolve, reject) => {
    const args = deviceId ? ['-s', deviceId, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'];
    const child = spawn(getAdbCmd(), args)

    const chunks: Buffer[] = []
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`ADB screencap timed out after 10s`))
    }, 10000)

    child.on('close', async (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Screencap failed with code ${code}`))
        return
      }

      const screenshotBuffer = Buffer.concat(chunks)
      const screenshotBase64 = screenshotBuffer.toString('base64')

      const parsed = parsePngSize(screenshotBuffer)
      if (parsed.width > 0 && parsed.height > 0) {
        const encoded = await encodeScreenshot(screenshotBuffer, 'android')
        resolve({ device: deviceInfo, ...encoded, resolution: { width: parsed.width, height: parsed.height } })
        return
      } else {
        // Fallback to querying wm size if parsing failed
        execAdb(['shell', 'wm', 'size'], deviceId)
          .then(sizeStdout => {
            let width = 0
            let height = 0
            const match = sizeStdout.match(/Physical size: (\d+)x(\d+)/)
            if (match) {
              width = parseInt(match[1], 10)
              height = parseInt(match[2], 10)
            }
            resolve({
              device: deviceInfo,
              screenshot: screenshotBase64,
              screenshot_mime: 'image/png',
              resolution: { width, height }
            })
          })
          .catch(() => {
            resolve({
              device: deviceInfo,
              screenshot: screenshotBase64,
              screenshot_mime: 'image/png',
              resolution: { width: 0, height: 0 }
            })
          })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}
