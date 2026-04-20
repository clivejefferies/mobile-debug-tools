import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { ToolsNetwork } from '../../../src/network/index.js'
import { getSystemStatus } from '../../../src/system/index.js'

async function run() {
  console.log('Starting network capture lifecycle tests...')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-network-capture-'))
  const mitmdumpPath = path.join(tmpDir, 'mitmdump')
  const captureFile = path.join(tmpDir, 'capture.ndjson')
  const originalMitmdumpPath = process.env.MITMDUMP_PATH

  try {
    await fs.writeFile(mitmdumpPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Mitmproxy: 10.0.0"
  exit 0
fi
trap "exit 0" TERM INT
while true; do
  sleep 1
done
`, { mode: 0o755 })

    process.env.MITMDUMP_PATH = mitmdumpPath
    ;(ToolsNetwork as any)._resetForTests()

    const initialStatus = await ToolsNetwork.getNetworkCaptureStatusHandler()
    assert.strictEqual(initialStatus.mitmdumpAvailable, true)
    assert.strictEqual(initialStatus.running, false)

    const started = await ToolsNetwork.startNetworkCaptureHandler({ captureFile, port: 9090 })
    assert.strictEqual(started.success, true)
    assert.strictEqual(started.started, true)
    assert.strictEqual(started.proxyPort, 9090)

    const runningStatus = await ToolsNetwork.getNetworkCaptureStatusHandler()
    assert.strictEqual(runningStatus.running, true)
    assert.strictEqual(runningStatus.captureFileConfigured, true)
    assert.strictEqual(runningStatus.captureFile, captureFile)

    const systemStatus = await getSystemStatus()
    assert(systemStatus.networkCapture, 'system status should include networkCapture')
    assert.strictEqual(systemStatus.networkCapture.mitmdumpAvailable, true)

    const stopped = await ToolsNetwork.stopNetworkCaptureHandler()
    assert.strictEqual(stopped.success, true)
    assert.strictEqual(stopped.stopped, true)

    const stoppedStatus = await ToolsNetwork.getNetworkCaptureStatusHandler()
    assert.strictEqual(stoppedStatus.running, false)

    console.log('network capture lifecycle tests passed')
  } finally {
    process.env.MITMDUMP_PATH = originalMitmdumpPath
    ;(ToolsNetwork as any)._resetForTests()
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
