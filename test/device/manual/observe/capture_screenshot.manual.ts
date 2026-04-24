import { ToolsObserve } from '../../../../src/observe/index.js'

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

async function main() {
  const platform = (readArg('--platform') || process.argv[2] || 'android') as 'android' | 'ios'
  const deviceId = readArg('--id') || readArg('--deviceId') || (process.argv[2]?.startsWith('-') ? undefined : process.argv[3])

  const result = await ToolsObserve.captureScreenshotHandler({ platform, deviceId })
  const screenshot = (result as any).screenshot || ''
  const fallback = (result as any).screenshot_fallback || ''

  console.log(JSON.stringify({
    device: result.device,
    resolution: result.resolution,
    mimeType: (result as any).screenshot_mime || 'image/png',
    screenshotBytes: screenshot ? Buffer.from(screenshot, 'base64').length : 0,
    fallbackBytes: fallback ? Buffer.from(fallback, 'base64').length : 0
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
