import { cleanupReadinessDevice } from './device-readiness-cleanup.js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Opt in only on a disposable emulator; never sleep the user's physical phone.
const deviceId = process.env.MCP_READINESS_DEVICE
if (!deviceId) console.log('UNRUN device readiness: set MCP_READINESS_DEVICE to a disposable emulator')
else {
  assert.match(deviceId, /^emulator-\d+$/)
  const adb = (...args: string[]) => execFileSync(process.env.ADB_PATH ?? 'adb', ['-s', deviceId, ...args], { encoding: 'utf8', timeout: 15000 })
  const client = new Client({ name: 'device-readiness-smoke', version: '1.0.0' })
  const observations: unknown[] = []
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const reply = await client.callTool({ name, arguments: { platform: 'android', deviceId, ...args } }, undefined, { timeout: 45000 })
    const content = reply.content.find(item => item.type === 'text')
    assert.ok(content?.type === 'text')
    const result = JSON.parse(content.text)
    observations.push({ tool: name, args, result })
    return result
  }
  let restore = false
  let journeyError: unknown
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' }))
    const initial = await call('get_app_readiness')
    assert.equal(initial.device_readiness.wakefulness, 'awake')
    assert.equal(initial.device_readiness.lock_state, 'unlocked', 'start with an unlocked disposable emulator')
    restore = true
    adb('shell', 'input', 'keyevent', '223')
    let sleeping = await call('get_app_readiness')
    for (let poll = 0; sleeping.device_readiness.wakefulness === 'transitioning' && poll < 10; poll++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      sleeping = await call('get_app_readiness')
    }
    assert.equal(sleeping.device_readiness.wakefulness, 'asleep')
    assert.equal(sleeping.device_readiness.input_ready, false)
    const launch = await call('start_app', { appId: 'com.android.settings', verificationMode: 'none', responseMode: 'compact', actionTimeoutMs: 10000 })
    assert.equal(launch.success, true)
    assert.equal(launch.device_readiness.input_ready, false, 'launch dispatch must not erase the blocker')
    for (const action of [
      { name: 'tap', args: { x: 10, y: 10 } },
      { name: 'swipe', args: { x1: 10, y1: 10, x2: 20, y2: 20, duration: 100 } }
    ]) {
      const input = await call(action.name, { ...action.args, verificationMode: 'none', responseMode: 'compact', actionTimeoutMs: 10000 })
      assert.equal(input.success, true)
      assert.ok(input.device_readiness.blockers.includes('DEVICE_ASLEEP'), 'ordinary input retains its resolved device blocker')
    }
    const wait = await call('wait_for_app_ready', { timeoutMs: 1200, pollIntervalMs: 100 })
    assert.equal(wait.success, false)
    assert.equal(wait.failure_code, 'READINESS_TIMEOUT')
    assert.ok(wait.device_readiness.blockers.includes('DEVICE_ASLEEP'), 'timeout retains the last observed blocker')
    adb('shell', 'input', 'keyevent', '224')
    const awake = await call('get_app_readiness')
    assert.equal(awake.device_readiness.wakefulness, 'awake')
    assert.ok(['locked', 'unlocked'].includes(awake.device_readiness.lock_state))
    console.log(awake.device_readiness.lock_state === 'locked' ? 'PASS awake keyguard observed' : 'UNRUN real locked state: this emulator wakes unlocked; security settings were not changed')
    // The default emulator has no passcode. Dismiss only its test keyguard to
    // restore the explicitly required unlocked starting state.
    adb('shell', 'wm', 'dismiss-keyguard')
    const recovered = await call('wait_for_app_ready', { timeoutMs: 15000, stabilityMs: 100, pollIntervalMs: 100 })
    assert.equal(recovered.success, true, JSON.stringify(recovered))
    assert.equal(recovered.device_readiness.lock_state, 'unlocked')
    assert.equal(recovered.device_readiness.input_ready, null)
  } catch (error) {
    journeyError = error
    throw error
  } finally {
    const failures = await cleanupReadinessDevice(restore, adb, () => client.close())
    if (process.env.MCP_READINESS_EVIDENCE) writeFileSync(process.env.MCP_READINESS_EVIDENCE, JSON.stringify({ deviceId, server: 'dist/server.js', server_sha256: createHash('sha256').update(readFileSync('dist/server.js')).digest('hex'), runtime: process.version, observations, cleanup: failures.length ? 'failed; all restoration steps and client close attempted' : 'wake, dismiss disposable keyguard, Home; no security settings changed' }, null, 2) + '\n')
    if (failures.length) throw new AggregateError(journeyError ? [journeyError, ...failures] : failures, 'Device readiness cleanup failed')
  }
  console.log('PASS Android readiness: sleeping launch, blocked wait, awake recovery and cleanup')
}
