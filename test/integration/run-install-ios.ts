#!/usr/bin/env node
import { iOSInteract } from '../../dist/ios/interact.js'

async function main() {
  const [, , appPath, deviceId] = process.argv
  if (!appPath) {
    console.error('Usage: node test/integration/run-install-ios.ts <.app-or-project-dir> [deviceId]')
    process.exit(1)
  }

  const inter = new iOSInteract()
  try {
    const res = await inter.installApp(appPath, deviceId || 'booted')
    console.log(JSON.stringify(res, null, 2))
  } catch (err) {
    console.error('Install failed:', err instanceof Error ? err.message : String(err))
    process.exit(2)
  }
}

main()
