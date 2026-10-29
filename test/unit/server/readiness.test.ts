import assert from 'node:assert/strict'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { handleToolCall, toolDefinitions } from '../../../src/server-core.js'
import { ToolsObserve, AndroidObserve } from '../../../src/observe/index.js'
import { deriveSnapshotMetadata, resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests, withResolvedDevice } from '../../../src/utils/resolve-device.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  const originalTree = ToolsObserve.getUITreeHandler
  const originalNative = AndroidObserve.prototype.getUITree
  const device = { platform: 'android', id: 'fixture', model: 'Fixture', osVersion: '16', simulator: true }
  let reads = 0
  let mode = 'stable'
  let delayed = 0
  const tree = () => {
    const label = mode === 'changing' ? `Item ${reads}` : mode === 'changeThenStable' && reads === 1 ? 'Before' : 'Ready'
    const elements = [{ type: 'Button', text: label, contentDescription: 'target', visible: true, enabled: true, clickable: true, bounds: [0, 0, 50, 50] }]
    if (mode === 'loading' || (mode === 'loaderThenReady' && reads <= 2)) elements.push({ type: 'android.widget.ProgressBar', text: '', contentDescription: '', visible: true, enabled: true, clickable: false, bounds: [0, 60, 20, 80] })
    const body = { device, elements, screen: '', resolution: { width: 100, height: 200 } }
    return { ...body, ...deriveSnapshotMetadata('android:fixture', body, 'ui_tree') }
  }
  ToolsObserve.getUITreeHandler = async () => {
    reads++
    if (delayed) await new Promise(resolve => setTimeout(resolve, delayed))
    if (mode === 'error') throw new Error('observation failed')
    if (mode === 'disconnect') return { ...tree(), error: 'device fixture offline' } as any
    return tree()
  }
  _setDeviceListersForTests({ listAndroidDevices: async () => [device] })
  const call = async (name: string, args: any = {}) => JSON.parse((await handleToolCall(name, { platform: 'android', deviceId: 'fixture', ...args })).content[0].text!)
  try {
    let result = await call('get_app_readiness', { stabilityMs: 100 })
    assert.equal(result.readiness.state, 'settled')
    assert.equal(result.success, true)
    assert.equal(reads, 2)
    mode = 'loading'; reads = 0
    result = await call('get_app_readiness')
    assert.equal(result.readiness.state, 'loading')
    assert.equal(reads, 1)
    mode = 'changing'; reads = 0
    result = await call('get_app_readiness', { stabilityMs: 100 })
    assert.equal(result.readiness.state, 'transitioning')
    assert.equal(result.success, true)
    mode = 'loaderThenReady'; reads = 0
    result = await call('wait_for_app_ready', { stabilityMs: 100, pollIntervalMs: 100, timeoutMs: 1500 })
    assert.equal(result.readiness.state, 'settled')
    assert.equal(result.success, true)
    assert.equal(reads, 4)
    mode = 'loading'; reads = 0
    result = await call('wait_for_app_ready', { timeoutMs: 200, pollIntervalMs: 100 })
    assert.equal(result.failure_code, 'READINESS_TIMEOUT')
    assert.equal(result.readiness.state, 'loading')
    assert.ok(result.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    assert.equal(result.readiness.capabilities.unresponsive, false)
    mode = 'stable'; reads = 0; delayed = 150
    result = await call('get_app_readiness', { timeoutMs: 100 })
    assert.equal(result.success, false, 'late physical read cannot produce success')
    assert.equal(result.readiness.state, 'unknown')
    delayed = 0
    mode = 'disconnect'; reads = 0
    result = await call('wait_for_app_ready')
    assert.equal(result.failure_code, 'DEVICE_UNAVAILABLE')
    assert.equal(reads, 1)
    mode = 'loading'; reads = 0
    const ordinary = await call('wait_for_ui', { selector: { text: 'Ready' }, timeout_ms: 1500, poll_interval_ms: 100 })
    assert.equal(ordinary.status, 'success', 'default wait keeps predicate-only semantics')
    assert.equal(ordinary.readiness, undefined)
    assert.equal(reads, 2)
    reads = 0
    const blocked = await call('wait_for_ui', { selector: { text: 'Ready' }, requireReady: true, timeout_ms: 650, poll_interval_ms: 100 })
    assert.equal(blocked.status, 'timeout')
    assert.equal(blocked.readiness.state, 'loading')
    assert.equal(blocked.observed.condition_satisfied, true, 'a readiness timeout must not pretend the visible target was absent')
    assert.ok(blocked.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    mode = 'loaderThenReady'; reads = 0
    const ready = await call('wait_for_ui', { selector: { text: 'Ready' }, requireReady: true, timeout_ms: 2000, poll_interval_ms: 100 })
    assert.equal(ready.status, 'success')
    assert.equal(ready.readiness.state, 'settled')
    assert.equal(reads, ready.readiness.sample_count, 'predicate and readiness share samples')
    mode = 'changeThenStable'; reads = 0
    const changed = await call('wait_for_ui_change', { requireReady: true, timeout_ms: 2500, stability_window_ms: 0 })
    assert.equal(changed.success, true, JSON.stringify(changed))
    assert.equal(changed.readiness.state, 'settled')
    assert.equal(reads, changed.readiness.sample_count)
    mode = 'stable'; reads = 0
    result = await runWithBudget(100, () => call('wait_for_app_ready', { timeoutMs: 2000, stabilityMs: 500 }))
    assert.equal(result.success, false, 'outer budget bounds the wait')
    assert.ok(result.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    _setDeviceListersForTests({ listAndroidDevices: async () => { await new Promise(resolve => setTimeout(resolve, 140)); return [] } })
    const discoveryTimeout = await call('wait_for_app_ready', { timeoutMs: 100 })
    assert.equal(discoveryTimeout.failure_code, 'READINESS_TIMEOUT', 'discovery deadline is not proof of a missing device')
    assert.ok(discoveryTimeout.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    _setDeviceListersForTests({ listAndroidDevices: async () => [device] })
    // The ordinary tree path adds single-sample metadata without extra acquisition.
    ToolsObserve.getUITreeHandler = originalTree
    let nativeReads = 0
    AndroidObserve.prototype.getUITree = async () => { nativeReads++; return tree() as any }
    for (const responseMode of ['debug', 'compact'] as const) {
      const observed: any = await withResolvedDevice(device, () => ToolsObserve.getUITreeHandler({ platform: 'android', deviceId: 'fixture', responseMode }))
      assert.equal(observed.readiness.state, 'unknown')
      assert.equal(observed.readiness.sample_count, 1)
    }
    assert.equal(nativeReads, 2, 'one native read per public tree response')
    const validator = new AjvJsonSchemaValidator()
    for (const name of ['get_app_readiness', 'wait_for_app_ready']) {
      const schema = validator.getValidator(toolDefinitions.find(tool => tool.name === name)!.inputSchema)
      assert.equal(schema({ platform: 'android' }).valid, true)
      for (const args of [{ platform: 'other' }, { platform: 'android', timeoutMs: 99 }, { platform: 'android', stabilityMs: 10001 }, { platform: 'android', extra: true }, { platform: 'android', deviceId: '' }]) {
        assert.equal(schema(args).valid, false)
        const result = JSON.parse((await handleToolCall(name, args)).content[0].text!)
        assert.match(result.error.message, /INVALID_ARGUMENT/)
      }
    }
    for (const name of ['wait_for_ui', 'wait_for_ui_change']) {
      const bad = await call(name, { requireReady: 'yes' })
      assert.match(bad.error.message, /INVALID_ARGUMENT/)
    }
    console.log('Readiness tools, schemas and opt-in waits: PASS')
  } finally {
    ToolsObserve.getUITreeHandler = originalTree
    AndroidObserve.prototype.getUITree = originalNative
    _resetDeviceListersForTests()
    resetSnapshotMetadataForTests()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
