import { handleAdjustControl } from '../../../src/server/handlers/interact.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import type { AdjustControlResponse } from '../../../src/types.js'
import { ReadinessTracker } from '../../../src/observe/readiness.js'
import { getSnapshotSessionId } from '../../../src/observe/snapshot-metadata.js'
import assert from 'node:assert/strict'
import { parseAndroidPower, parseAndroidLock, observeDeviceReadiness, parseIosLock, withDeviceReadinessProbe } from '../../../src/observe/device-readiness.js'
import { registerDebuggerPauseProvider } from '../../../src/debugger/guard.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'
import { compactAction, actionHandler } from '../../../src/server/handlers/action-execution.js'
import { wrapResponse } from '../../../src/server/common.js'
import { withResolvedDevice } from '../../../src/utils/resolve-device.js'

const power = (state: string, changing = 'false') => `mWakefulness=${state}\nmWakefulnessChanging=${changing}`
const lock = (state: string) => `KeyguardServiceDelegate\n showing=${state}\n KeyguardStateMonitor\n mIsShowing=${state}`
for (const [text, expected] of [[power('Awake'), 'awake'], [power('Asleep'), 'asleep'], [power('Dozing'), 'asleep'], [power('Awake', 'true'), 'transitioning'], [power('Dreaming'), 'unknown'], ['mWakefulness=Awake', 'unknown'], [power('Awake') + '\nmWakefulness=Asleep', 'unknown']]) assert.equal(parseAndroidPower(text), expected)
assert.equal(parseAndroidPower('Power Manager State:\n' + power('Dozing') + '\nSettings and Configuration:\nmWakefulness=3'), 'asleep', 'vendor debug fields outside current-state section cannot conflict with it')
assert.equal(parseAndroidLock(lock('true')), 'locked')
assert.equal(parseAndroidLock(lock('false')), 'unlocked')
for (const text of ['', 'deviceHasKeyguard=true', 'showing=false', lock('true').replace('mIsShowing=true', 'mIsShowing=false')]) assert.equal(parseAndroidLock(text), 'unknown')
const unsupported = JSON.stringify({ error: { domain: 'com.apple.dt.CoreDeviceError', code: 1001, userInfo: { CapabilityFeatureIdentifier: { string: 'com.apple.coredevice.feature.getlockstate' } } } })
assert.equal(parseIosLock(unsupported), 'unsupported')
assert.equal(parseIosLock(unsupported.replace('getlockstate', 'other')), 'unknown')
assert.equal(parseIosLock('{"result":{"passcodeRequired":false}}'), 'unknown', 'unverified success semantics cannot establish unlocked')
const device = { platform: 'android', id: 'fixture', model: 'Fixture', osVersion: '16', simulator: true }
async function run() {
  const calls: string[][] = []
  const probe = async (_command: string, args: string[], timeout: number) => {
    calls.push(args)
    assert.ok(timeout > 0 && timeout <= 1000)
    return { exitCode: 0, stdout: args.includes('power') ? power('Asleep') : lock('true'), stderr: '' }
  }
  const started = Date.now()
  const state = await runWithBudget(500, () => observeDeviceReadiness(device, probe))
  assert.deepEqual(state.blockers, ['DEVICE_ASLEEP', 'DEVICE_LOCKED'])
  assert.equal(state.input_ready, false)
  assert.ok(state.evidence.every(item => item.captured_at_ms >= started))
  assert.ok(calls.every(args => args[0] === '-s' && args[1] === device.id))
  assert.ok(!JSON.stringify(state).includes('mWakefulness'))
  const partial = await observeDeviceReadiness(device, async (...args) => {
    if (args[1].includes('power')) throw new Error('private diagnostic')
    return probe(...args)
  })
  assert.equal(partial.wakefulness, 'unknown')
  assert.equal(partial.lock_state, 'locked')
  assert.ok(!JSON.stringify(partial).includes('private diagnostic'))
  const recovered = await observeDeviceReadiness(device, async (_cmd, args) => ({ exitCode: 0, stdout: args.includes('power') ? power('Awake') : lock('false'), stderr: '' }))
  assert.equal(recovered.input_ready, null)
  assert.deepEqual(recovered.blockers, [])
  const tracker = new ReadinessTracker(device.platform, device.id, 100)
  const tree = { device, captured_at_ms: Date.now(), snapshot_revision: 1, snapshot_session_id: getSnapshotSessionId(), resolution: { width: 100, height: 100 }, elements: [{ type: 'Button', visible: true, text: 'Ready' }] }
  tracker.observe(tree, tree.captured_at_ms, 0)
  assert.equal(tracker.observe(tree, tree.captured_at_ms, 100).state, 'settled')
  await withDeviceReadinessProbe(probe, () => tracker.observeDevice())
  assert.equal(tracker.ready, false)
  await withDeviceReadinessProbe(async (_cmd, args) => ({ exitCode: 0, stdout: args.includes('power') ? power('Awake') : lock('false'), stderr: '' }), () => tracker.observeDevice())
  assert.equal(tracker.observe(tree, tree.captured_at_ms, 500).state, 'unknown', 'blocker breaks UI stability continuity')
  assert.equal(tracker.observe(tree, tree.captured_at_ms, 600).state, 'settled')
  const before = calls.length
  const expired = await runWithBudget(0, () => observeDeviceReadiness(device, probe))
  assert.equal(calls.length, before, 'no probe starts after expiry')
  assert.equal(expired.wakefulness, 'unknown')
  assert.equal((await observeDeviceReadiness(null, probe)).limitations[0], 'DEVICE_TARGET_UNAVAILABLE')
  const ios = await observeDeviceReadiness({ platform: 'ios', id: 'ios-fixture' }, async (_cmd, args, timeout) => { assert.equal(args[args.indexOf('--timeout') + 1], '5'); assert.ok(timeout <= 1000); return { exitCode: 1, stdout: unsupported, stderr: '' } })
  assert.equal(ios.lock_state, 'unsupported')
  assert.equal(ios.wakefulness, 'unknown')
  registerDebuggerPauseProvider(() => ({ debug_session_id: 'paused', captured_at_ms: started, target: {} }))
  try {
    const paused = await observeDeviceReadiness(device, probe)
    assert.deepEqual(paused.blockers, ['DEBUGGER_PAUSED'])
    assert.equal(calls.length, before)
  } finally { registerDebuggerPauseProvider(() => null) }
  assert.deepEqual(compactAction({ success: true, device_readiness: state }, 'none').device_readiness, state)
  for (const responseMode of ['debug', 'compact']) {
    const response = await withDeviceReadinessProbe(probe, () => withResolvedDevice(device, () => actionHandler('start_app', async () => wrapResponse({ success: true, device }))( { platform: 'android', deviceId: device.id, responseMode, verificationMode: 'none', actionTimeoutMs: 500 })))
    const result = JSON.parse(response.content[0].text!)
    assert.equal(result.success, true, 'blocker observation preserves dispatch outcome')
    assert.equal(result.verification.status, 'not_requested')
    assert.deepEqual(result.device_readiness.blockers, ['DEVICE_ASLEEP', 'DEVICE_LOCKED'])
  }
  const failedProbe = await withDeviceReadinessProbe(async () => { throw new Error('private'); }, () => withResolvedDevice(device, () => actionHandler('tap', async () => wrapResponse({ success: true, device }))({ responseMode: 'compact', verificationMode: 'none', actionTimeoutMs: 200 })))
  const unknown = JSON.parse(failedProbe.content[0].text!)
  assert.equal(unknown.success, true)
  assert.equal(unknown.device_readiness.wakefulness, 'unknown')
  assert.equal(unknown.device_readiness.lock_state, 'unknown')
  assert.ok(!JSON.stringify(unknown.device_readiness).includes('private'))
  const adjust = ToolsInteract.adjustControlHandler
  ToolsInteract.adjustControlHandler = async () => ({ success: true, device } as AdjustControlResponse)
  try {
    const response = await withDeviceReadinessProbe(probe, () => handleAdjustControl({ selector: { text: 'Volume' }, targetValue: 50 }))
    const result = JSON.parse(response.content[0].text!)
    assert.equal(result.success, true)
    assert.equal(result.device_readiness.input_ready, false, 'adjust_control carries the same blocker contract')
  } finally { ToolsInteract.adjustControlHandler = adjust }
  console.log('Device readiness: parsing, probes, budgets, recovery, debugger and action contracts PASS')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
