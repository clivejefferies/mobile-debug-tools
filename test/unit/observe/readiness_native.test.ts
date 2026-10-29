import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleToolCall } from '../../../src/server-core.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'

async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-ready-native-'))
  const binary = path.join(directory, 'native')
  const marker = path.join(directory, 'closed')
  const keys = ['ADB_PATH', 'IDB_PATH', 'MCP_IDB_PATH', 'XCRUN_PATH', 'READY_SLOW', 'READY_LOADER', 'READY_SLOW_META']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  writeFileSync(binary, `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2).join(' ')
function slow() { process.on('SIGTERM', () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(marker)}, 'closed'); process.exit(0) }, 40)); setInterval(() => {}, 1000) }
if (a.includes('ro.build.version.release')) console.log('16')
else if (a.includes('ro.product.model')) console.log('Fixture')
else if (a.includes('ro.kernel.qemu')) console.log('1')
else if (a.includes('wm size')) console.log('Physical size: 100x200')
else if (a.includes('uiautomator dump')) { if (process.env.READY_SLOW) slow(); else console.log('dumped') }
else if (a.includes('cat /sdcard/ui.xml')) console.log('<hierarchy><node class="' + (process.env.READY_LOADER ? 'android.widget.ProgressBar' : 'android.widget.Button') + '" text="Ready" visible-to-user="true" enabled="true" bounds="[0,0][100,200]" /></hierarchy>')
else if (a.includes('simctl list devices')) { if (process.env.READY_SLOW_META) { fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000) } else console.log(JSON.stringify({ devices: { 'iOS-18': [{ udid: 'fixture', name: 'Fixture', state: 'Booted' }] } })) }
else if (a.includes('list-targets')) console.log('[]')
else if (a.includes('ui describe-all')) { if (process.env.READY_SLOW) slow(); else console.log(JSON.stringify({ AXElementType: process.env.READY_LOADER ? 'ActivityIndicator' : 'Button', AXLabel: 'Ready', AXFrame: { x: 0, y: 0, width: 100, height: 200 } })) }
else process.exit(1)
`)
  chmodSync(binary, 0o755)
  for (const key of ['ADB_PATH', 'IDB_PATH', 'MCP_IDB_PATH', 'XCRUN_PATH']) process.env[key] = binary
  const device = (platform: string) => ({ platform, id: 'fixture', model: 'Fixture', simulator: true, osVersion: '16' })
  _setDeviceListersForTests({ listAndroidDevices: async () => [device('android')], listIOSDevices: async () => [device('ios')] })
  const call = async (platform: string, args: any) => JSON.parse((await handleToolCall('get_app_readiness', { platform, deviceId: 'fixture', ...args })).content[0].text!)
  try {
    for (const platform of ['android', 'ios']) {
      const stable = await call(platform, { stabilityMs: 100 })
      assert.equal(stable.readiness.state, 'settled', JSON.stringify(stable))
      assert.equal(stable.readiness.sample_count, 2)
      process.env.READY_LOADER = '1'
      const loader = await call(platform, {})
      assert.equal(loader.readiness.state, 'loading')
      assert.equal(loader.readiness.basis, 'observed')
      delete process.env.READY_LOADER
      process.env.READY_SLOW = '1'
      writeFileSync(marker, '')
      const timed = await call(platform, { timeoutMs: 1500 })
      assert.equal(timed.success, false)
      assert.equal(timed.readiness.state, 'unknown')
      assert.ok(timed.readiness.limitations.includes('DEADLINE_EXCEEDED'))
      assert.equal(readFileSync(marker, 'utf8'), 'closed', 'timed-out native acquisition closes its child before responding')
      delete process.env.READY_SLOW
    }
    process.env.READY_SLOW_META = '1'
    writeFileSync(marker, '')
    const metadataTimeout = await call('ios', { timeoutMs: 300 })
    assert.equal(metadataTimeout.success, false)
    assert.ok(metadataTimeout.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    const pid = Number(readFileSync(marker, 'utf8'))
    assert.ok(pid > 0)
    assert.throws(() => process.kill(pid, 0), (error: any) => error.code === 'ESRCH', 'metadata child must be closed after its deadline')
    delete process.env.READY_SLOW_META
    console.log('Readiness native Android/iOS acquisition and timeout cleanup: PASS')
  } finally {
    _resetDeviceListersForTests()
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }
    rmSync(directory, { recursive: true, force: true })
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
