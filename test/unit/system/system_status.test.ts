import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import * as systemStatus from '../../../src/system/index.js'

async function writeFakeCommands(binDir: string) {
  const adbPath = path.join(binDir, 'adb')
  const xcrunPath = path.join(binDir, 'xcrun')

  await fs.writeFile(adbPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  if [ "\${ADB_VERSION_STATUS:-0}" != "0" ]; then
    printf '%s' "\${ADB_VERSION_OUTPUT:-not found}" >&2
    exit "\${ADB_VERSION_STATUS}"
  fi
  printf '%s' "\${ADB_VERSION_OUTPUT:-Android Debug Bridge version 8.1.0}"
  exit 0
fi
if [ "$1" = "devices" ]; then
  printf '%s' "\${ADB_DEVICES_OUTPUT:-List of devices attached}"
  exit 0
fi
if [ "$1" = "logcat" ]; then
  printf '%s' "\${ADB_LOGCAT_OUTPUT:-I/Tag: ok}"
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ]; then
  printf '%s' "\${ADB_PM_PATH_OUTPUT:-package:/data/app/com.example/base.apk}"
  exit 0
fi
printf '%s' "\${ADB_DEFAULT_OUTPUT:-OK}"
exit 0
`, { mode: 0o755 })

  await fs.writeFile(xcrunPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  if [ "\${XCRUN_VERSION_STATUS:-0}" != "0" ]; then
    printf '%s' "\${XCRUN_VERSION_OUTPUT:-not found}" >&2
    exit "\${XCRUN_VERSION_STATUS}"
  fi
  printf '%s' "\${XCRUN_VERSION_OUTPUT:-xcrun version 123}"
  exit 0
fi
if [ "$1" = "simctl" ] && [ "$2" = "list" ] && [ "$3" = "devices" ] && [ "$4" = "booted" ] && [ "$5" = "--json" ]; then
  printf '%s' "\${SIMCTL_LIST_OUTPUT:-{\"devices\":{}}}"
  exit 0
fi
printf '%s' "\${XCRUN_DEFAULT_OUTPUT:-ok}"
exit 0
`, { mode: 0o755 })

  return { adbPath, xcrunPath }
}

function setScenario(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function run() {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-system-status-'))
  const originalEnv = {
    ADB_PATH: process.env.ADB_PATH,
    XCRUN_PATH: process.env.XCRUN_PATH,
    ADB_VERSION_OUTPUT: process.env.ADB_VERSION_OUTPUT,
    ADB_VERSION_STATUS: process.env.ADB_VERSION_STATUS,
    ADB_DEVICES_OUTPUT: process.env.ADB_DEVICES_OUTPUT,
    ADB_LOGCAT_OUTPUT: process.env.ADB_LOGCAT_OUTPUT,
    ADB_PM_PATH_OUTPUT: process.env.ADB_PM_PATH_OUTPUT,
    XCRUN_VERSION_OUTPUT: process.env.XCRUN_VERSION_OUTPUT,
    XCRUN_VERSION_STATUS: process.env.XCRUN_VERSION_STATUS,
    SIMCTL_LIST_OUTPUT: process.env.SIMCTL_LIST_OUTPUT,
  }

  try {
    const { adbPath, xcrunPath } = await writeFakeCommands(binDir)
    process.env.ADB_PATH = adbPath
    process.env.XCRUN_PATH = xcrunPath

    setScenario({
      ADB_VERSION_STATUS: '0',
      ADB_VERSION_OUTPUT: '8.1.0\n',
      ADB_DEVICES_OUTPUT: 'List of devices attached\nemulator-5554\tdevice product:sdk\n',
      ADB_LOGCAT_OUTPUT: 'I/Tag: ok\n',
      XCRUN_VERSION_STATUS: '0',
      XCRUN_VERSION_OUTPUT: 'xcrun version 123\n',
      SIMCTL_LIST_OUTPUT: JSON.stringify({ devices: { runtime: [{ state: 'Booted' }] } }),
    })

    const healthy = await systemStatus.getSystemStatus()
    assert.strictEqual(healthy.success, true)
    assert.strictEqual(healthy.adbAvailable, true)
    assert.strictEqual(typeof healthy.adbVersion, 'string')

    setScenario({
      ADB_VERSION_STATUS: '1',
      ADB_VERSION_OUTPUT: 'not found',
      ADB_DEVICES_OUTPUT: 'List of devices attached\n',
      XCRUN_VERSION_STATUS: '0',
      XCRUN_VERSION_OUTPUT: 'xcrun version\n',
    })
    const missingAdb = await systemStatus.getSystemStatus()
    assert.strictEqual(missingAdb.success, false)
    assert(missingAdb.issues.some((issue: string) => issue.includes('ADB')))

    setScenario({
      ADB_VERSION_STATUS: '0',
      ADB_VERSION_OUTPUT: '8.1.0\n',
      ADB_DEVICES_OUTPUT: 'List of devices attached\nserial1\tunauthorized\nserial2\toffline\n',
      XCRUN_VERSION_STATUS: '0',
      XCRUN_VERSION_OUTPUT: 'xcrun version\n',
    })
    const unauthorized = await systemStatus.getSystemStatus()
    assert.strictEqual(unauthorized.success, false)
    assert(unauthorized.issues.some((issue: string) => issue.includes('unauthorized')))
    assert(unauthorized.issues.some((issue: string) => issue.includes('offline')))

    setScenario({
      ADB_VERSION_STATUS: '0',
      ADB_VERSION_OUTPUT: '8.1.0\n',
      ADB_DEVICES_OUTPUT: 'List of devices attached\nemulator-5554\tdevice product:sdk\n',
      XCRUN_VERSION_STATUS: '1',
      XCRUN_VERSION_OUTPUT: 'not found',
    })
    const missingXcrun = await systemStatus.getSystemStatus()
    assert.strictEqual(missingXcrun.iosAvailable, false)
    assert.strictEqual(missingXcrun.adbAvailable, true)
    assert.strictEqual(Array.isArray(missingXcrun.issues), true)

    console.log('system_status checks passed')
  } finally {
    setScenario(originalEnv)
    await fs.rm(binDir, { recursive: true, force: true }).catch(() => {})
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
