import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import * as systemStatus from '../../../src/system/index.js'

async function run() {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-system-adb-'))
  const adbPath = path.join(binDir, 'adb')
  const originalAdbPath = process.env.ADB_PATH

  try {
    await fs.writeFile(adbPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf 'Android Debug Bridge version 1.0.41\nRevision 8f3b7\n'
  exit 0
fi
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\n'
  exit 0
fi
exit 0
`, { mode: 0o755 })
    process.env.ADB_PATH = adbPath
    const res = await systemStatus.getSystemStatus()
    assert.strictEqual(res.adbVersion, 'Android Debug Bridge version 1.0.41')
    console.log('adb version parsing test passed')
  } finally {
    if (originalAdbPath === undefined) delete process.env.ADB_PATH
    else process.env.ADB_PATH = originalAdbPath
    await fs.rm(binDir, { recursive: true, force: true }).catch(() => {})
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
