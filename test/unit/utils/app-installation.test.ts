import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { probeInstallation, installationFields } from '../../../src/utils/app-installation.js'
import { listAndroidDevices } from '../../../src/utils/android/utils.js'
import { checkAndroid } from '../../../src/system/android.js'
import { ToolsManage } from '../../../src/manage/index.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'

const dir = await mkdtemp(path.join(os.tmpdir(), 'installation-test-'))
const binary = path.join(dir, 'adb')
const saved = { ...process.env }
try {
  await writeFile(binary, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === '--version') console.log('Android Debug Bridge version 1.0.41')
else if (args[0] === 'devices') console.log(process.env.ONE_INSTALL_DEVICE ? 'List of devices attached\\na device' : 'List of devices attached\\na device\\nb device')
else if (args.includes('getprop')) console.log('14')
else if (args.includes('logcat')) console.log('log')
else if (args.includes('listapps')) {
  if (args.at(-1) === 'failed') process.exit(1)
  if (args.at(-1) === 'malformed') {console.log('not a plist'); process.exit(0)}
  console.log('<?xml version="1.0"?><plist version="1.0"><dict><key>com.example.app</key><dict/></dict></plist>')
}
else {
  const id = args[1], app = args.at(-1)
  if (id === 'b' && args.includes('path')) process.exit(1)
  if (id === 'failed') process.exit(1)
  if (id === 'malformed') console.log('Error: query failed')
  else if (id === 'slow') setTimeout(() => console.log('package:/late.apk'), 1000)
  else if (app === 'com.example.app' && id !== 'b') console.log('package:/data/app/base.apk')
}
`, { mode: 0o755 })
  process.env.ADB_PATH = binary
  delete process.env.MCP_TARGET_PACKAGE
  delete process.env.MCP_TARGET_APP_ID
  const check = (id: string, app: string | undefined = 'com.example.app') => probeInstallation(binary, id, app, 'android-current-user')
  assert.equal((await check('a')).status, 'installed')
  assert.equal((await check('b')).status, 'absent')
  for (const id of ['failed', 'malformed']) {
    const result = await check(id)
    assert.equal(result.status, 'unknown')
    assert(!JSON.stringify(installationFields(result)).includes('appInstalled'))
  }
  assert.equal((await probeInstallation(binary, 'a', undefined, 'android-current-user')).reason, 'APP_ID_NOT_PROVIDED')
  assert.equal((await check('a', 'bad;input')).checkedAt, null)
  assert.equal((await probeInstallation(binary, 'a', 'com.example.app', 'android-current-user', false)).reason, 'DEVICE_UNAVAILABLE')
  assert.equal((await runWithBudget(50, () => check('slow'))).status, 'unknown')
  if (process.platform === 'darwin') {
    assert.equal((await probeInstallation(binary, 'a', 'com.example.app', 'ios-simulator')).status, 'installed')
    assert.equal((await probeInstallation(binary, 'a', 'com.missing.app', 'ios-simulator')).status, 'absent')
    assert.equal((await probeInstallation(binary, 'failed', 'com.example.app', 'ios-simulator')).status, 'unknown')
    assert.equal((await probeInstallation(binary, 'malformed', 'com.example.app', 'ios-simulator')).status, 'unknown')
  }
  const inventory = await listAndroidDevices()
  assert.equal(inventory.length, 2)
  assert(inventory.every(device => device.appInstallation?.reason === 'APP_ID_NOT_PROVIDED' && !Object.hasOwn(device, 'appInstalled')))
  const scoped = await listAndroidDevices('com.example.app')
  assert.deepEqual(scoped.map(device => device.appInstalled), [true, false])
  assert.deepEqual(scoped.map(device => device.appInstallation?.deviceId), ['a', 'b'])
  process.env.MCP_TARGET_PACKAGE = 'com.example.app'
  const system = await checkAndroid()
  assert.equal(system.appInstalled, undefined)
  assert.deepEqual(system.appInstallations.map(result => result.status), ['installed', 'absent'])
  assert(system.issues.some(issue => issue.includes('device b')))
  process.env.ONE_INSTALL_DEVICE = '1'
  assert.equal((await checkAndroid()).appInstalled, true)
  process.env.MCP_TARGET_PACKAGE = 'bad;input'
  const invalid = await checkAndroid()
  assert.equal(invalid.appInstalled, undefined)
  assert.equal(invalid.appInstallations[0].checkedAt, null)
  await assert.rejects(() => ToolsManage.listDevicesHandler({ appId: 'bad;input' }), /Invalid appId/)
  console.log('app installation tests passed')
} finally {
  process.env = saved
  await rm(dir, { recursive: true, force: true })
}
