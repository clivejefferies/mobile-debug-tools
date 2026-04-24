import { ToolsObserve } from '../../../../src/observe/index.js'

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

async function main() {
  const platform = (readArg('--platform') || process.argv[2] || 'android') as 'android' | 'ios'
  const deviceId = readArg('--id') || readArg('--deviceId') || (process.argv[2]?.startsWith('-') ? undefined : process.argv[3])

  const result = await ToolsObserve.getUITreeHandler({ platform, deviceId })
  if ((result as any).error) throw new Error((result as any).error)

  const firstElement = Array.isArray((result as any).elements) ? (result as any).elements[0] : null

  console.log(JSON.stringify({
    device: (result as any).device,
    resolution: (result as any).resolution,
    elementCount: Array.isArray((result as any).elements) ? (result as any).elements.length : 0,
    hasCenterAndDepth: firstElement ? ('center' in firstElement && 'depth' in firstElement) : true
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
