import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleToolCall, toolDefinitions } from '../../../src/server-core.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { ToolsNetwork } from '../../../src/observe/network/index.js'
import { deriveSnapshotMetadata, getSnapshotSessionId, resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-conditional-'))
  const eventsPath = path.join(directory, 'events')
  const native = path.join(directory, 'native')
  const changedPath = path.join(directory, 'prepared')
  const envKeys = ['ADB_PATH', 'IDB_PATH', 'MCP_IDB_PATH', 'XCRUN_PATH', 'MCP_CONDITION_PREPARE', 'MCP_CONDITION_INPUT_FAIL', 'MCP_CONDITION_TREE_TEXT', 'MCP_CONDITION_SLOW']
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  writeFileSync(eventsPath, '')
  writeFileSync(native, `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2).join(' ')
function slow() {
  process.on('SIGTERM', () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(changedPath)}, 'closed'); process.exit(0) }, 40))
  setInterval(() => {}, 1000)
}
fs.appendFileSync(${JSON.stringify(eventsPath)}, args + '\\n')
if (args.includes('ro.build.version.release')) console.log('16')
else if (args.includes('ro.product.model')) { if (process.env.MCP_CONDITION_PREPARE) fs.writeFileSync(${JSON.stringify(changedPath)}, 'changed'); console.log('Fixture') }
else if (args.includes('ro.kernel.qemu')) console.log('1')
else if (args.includes('simctl list devices')) console.log(JSON.stringify({ devices: { 'iOS-18': [{ udid: 'fixture', name: 'Fixture', state: 'Booted' }] } }))
else if (args.includes('list-targets')) { if (process.env.MCP_CONDITION_PREPARE) fs.writeFileSync(${JSON.stringify(changedPath)}, 'changed'); console.log('[]') }
else if (args.includes('wm size')) console.log('Physical size: 100x200')
else if (args.includes('uiautomator dump')) { if (process.env.MCP_CONDITION_SLOW) slow(); else console.log('dumped') }
else if (args.includes('cat /sdcard/ui.xml')) console.log('<hierarchy><node class="android.widget.Button" resource-id="target" text="' + (process.env.MCP_CONDITION_TREE_TEXT || 'Ready') + '" clickable="true" enabled="true" visible-to-user="true" bounds="[0,0][50,50]" /></hierarchy>')
else if (args.includes('ui describe-all')) { if (process.env.MCP_CONDITION_SLOW) slow(); else console.log(JSON.stringify({ AXElementType: 'Button', AXLabel: process.env.MCP_CONDITION_TREE_TEXT || 'Ready', AXUniqueId: 'target', AXFrame: { x: 0, y: 0, width: 100, height: 200 } })) }
else if (args.includes('shell input') || args.includes('ui tap') || args.includes('ui swipe')) { if (process.env.MCP_CONDITION_INPUT_FAIL) process.exit(1) }
else process.exit(1)
`)
  chmodSync(native, 0o755)
  for (const key of ['ADB_PATH', 'IDB_PATH', 'MCP_IDB_PATH', 'XCRUN_PATH']) process.env[key] = native
  const originalTree = ToolsObserve.getUITreeHandler
  const originalFingerprint = ToolsObserve.getScreenFingerprintHandler
  const originalNotify = ToolsNetwork.notifyActionStart
  let networkStarts = 0
  let reads = 0
  let observationMode = 'normal'
  let readDelay = 0
  let uiState = 'Ready'
  let propertyChange: Record<string, unknown> = {}
  let platform: 'android' | 'ios' = 'android'
  const device = () => ({ platform, id: 'fixture', osVersion: '16', model: 'Fixture', simulator: true })
  const tree = () => {
    const elements = [{ text: uiState, contentDescription: 'target', type: 'Button', stable_id: 'target', resourceId: 'target', bounds: [0, 0, 50, 50], enabled: true, visible: true, clickable: true, state: { checked: false }, ...propertyChange }]
    const body = { device: device(), screen: '', resolution: { width: 100, height: 200 }, elements }
    return { ...body, ...deriveSnapshotMetadata(`${platform}:fixture`, body, 'ui_tree') }
  }
  ToolsObserve.getUITreeHandler = async () => {
    reads++
    if (readDelay) await new Promise(resolve => setTimeout(resolve, readDelay))
    if (process.env.MCP_CONDITION_PREPARE && readFileSync(changedPath, 'utf8') === 'changed') uiState = 'Changed during preparation'
    if (observationMode === 'throw') throw new Error('offline')
    const fresh = tree()
    if (observationMode === 'error') return { ...fresh, error: 'offline' } as any
    if (observationMode === 'invalid') return { ...fresh, snapshot_session_id: undefined } as any
    if (observationMode === 'device') return { ...fresh, device: { ...device(), id: 'other' } } as any
    return fresh
  }
  ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: 'unchanged-screen' }) as any
  ToolsNetwork.notifyActionStart = () => { networkStarts++ }
  _setDeviceListersForTests({ listAndroidDevices: async () => [device()], listIOSDevices: async () => [device()] })
  const payload = (response: any) => JSON.parse(response.content[0].text)
  const nativeInputs = () => readFileSync(eventsPath, 'utf8').split('\n').filter(line => /shell input|ui tap|ui swipe/.test(line))
  const baseline = () => {
    uiState = 'Ready'; propertyChange = {}; observationMode = 'normal'; readDelay = 0
    const value = tree()
    return { snapshotSessionId: value.snapshot_session_id, snapshotRevision: value.snapshot_revision }
  }
  const argsFor = (tool: string) => ({
    platform, deviceId: 'fixture', verificationMode: 'none', responseMode: 'compact',
    ...({ tap: { x: 10, y: 10 }, tap_element: { selector: { accessibility_id: 'target' } }, swipe: { x1: 10, y1: 10, x2: 20, y2: 20, duration: 100 }, type_text: { text: 'hello' }, press_back: {} }[tool])
  })
  const call = async (tool: string, extra: Record<string, unknown> = {}) => payload(await handleToolCall(tool, { ...argsFor(tool), ...extra }))
  try {
    resetSnapshotMetadataForTests()
    // Exercise production dispatch adapters, not mocked ToolsInteract input handlers.
    for (platform of ['android', 'ios'] as const) {
      const tools = platform === 'android' ? ['tap', 'tap_element', 'swipe', 'type_text', 'press_back'] : ['tap', 'tap_element', 'swipe']
      for (const tool of tools) {
        const expectedState = baseline()
        const inputs = nativeInputs().length
        const starts = networkStarts
        const result = await call(tool, { expectedState })
        assert.equal(result.success, true, JSON.stringify(result))
        assert.equal(result.condition.status, 'matched')
        assert.equal(result.condition.observed.elements, undefined, 'compact matching conditions omit tree')
        assert.equal(result.condition.observed.snapshot_revision, expectedState.snapshotRevision)
        assert.equal(nativeInputs().length, inputs + 1, `${platform} ${tool} dispatches once`)
        assert.equal(networkStarts, starts + 1)
      }
      // Change happens after ordinary resolution and metadata/capability preparation.
      for (const tool of ['tap', 'tap_element', 'swipe']) {
        const expectedState = baseline()
        writeFileSync(changedPath, '')
        process.env.MCP_CONDITION_PREPARE = '1'
        const inputs = nativeInputs().length
        const starts = networkStarts
        const result = await call(tool, { expectedState, responseMode: 'debug' })
        delete process.env.MCP_CONDITION_PREPARE
        assert.equal(result.failure_code, 'PRECONDITION_FAILED', JSON.stringify(result))
        assert.equal(result.dispatch_started, false)
        assert.equal(result.condition.observed.elements[0].text, 'Changed during preparation')
        assert.equal(nativeInputs().length, inputs)
        assert.equal(networkStarts, starts)
        assert.ok(!result.trace.steps.some((step: any) => step.stage === 'execute'))
      }
    }
    platform = 'android'
    for (const verificationMode of ['none', 'light', 'full']) for (const responseMode of ['compact', 'debug']) {
      for (const changed of [{ text: 'Changed' }, { bounds: [1, 1, 51, 51] }, { enabled: false }, { state: { checked: true } }]) {
        const expectedState = baseline()
        propertyChange = changed
        const inputs = nativeInputs().length
        const starts = networkStarts
        reads = 0
        const result = await call('tap', { expectedState, verificationMode, responseMode })
        assert.equal(result.failure_code, 'PRECONDITION_FAILED')
        assert.equal(result.condition.status, 'mismatch')
        assert.equal(result.retryable, false)
        assert.equal(result.delivery_status, 'not_delivered')
        assert.equal(result.verification.status, 'not_requested')
        assert.deepEqual(result.condition.observed.elements[0], tree().elements[0])
        assert.equal(reads, 1, 'no post-dispatch tree read after guard failure')
        assert.equal(nativeInputs().length, inputs)
        assert.equal(networkStarts, starts)
      }
      const expectedState = baseline()
      const matched = await call('tap', { expectedState, verificationMode, responseMode })
      assert.equal(matched.success, true)
      assert.equal(matched.condition.status, 'matched')
      assert.equal(Array.isArray(matched.condition.observed.elements), responseMode === 'debug')
    }
    for (const [mode, reason] of [['error', 'OBSERVATION_FAILED'], ['throw', 'OBSERVATION_FAILED'], ['invalid', 'OBSERVATION_INVALID'], ['device', 'DEVICE_MISMATCH']]) {
      const expectedState = baseline()
      observationMode = mode
      const inputs = nativeInputs().length
      const result = await call('tap', { expectedState })
      assert.equal(result.failure_code, 'PRECONDITION_UNAVAILABLE')
      assert.equal(result.condition.reason, reason)
      assert.equal(result.condition.observed, null)
      assert.equal(nativeInputs().length, inputs)
    }
    for (const expectation of [
      { ...baseline(), snapshotSessionId: 'previous-process' },
      { ...baseline(), snapshotRevision: 999999 }
    ]) {
      reads = 0
      const result = await call('tap', { expectedState: expectation })
      assert.equal(result.failure_code, 'PRECONDITION_UNAVAILABLE')
      assert.equal(reads, 0, 'unknown expectations cannot authorize a read/input')
    }
    const foreign = baseline()
    platform = 'ios'
    const foreignResult = await call('tap', { expectedState: foreign })
    assert.equal(foreignResult.condition.reason, 'BASELINE_UNAVAILABLE')
    platform = 'android'
    const expired = baseline()
    const originalNow = Date.now
    try {
      Date.now = () => originalNow() + 11 * 60 * 1000
      const result = await call('tap', { expectedState: expired })
      assert.equal(result.condition.reason, 'BASELINE_UNAVAILABLE')
    } finally { Date.now = originalNow }
    const evicted = baseline()
    for (let index = 0; index < 9; index++) { uiState = `screen-${index}`; tree() }
    assert.equal((await call('tap', { expectedState: evicted })).condition.reason, 'BASELINE_UNAVAILABLE')

    const timed = baseline()
    readDelay = 180
    const inputs = nativeInputs().length
    const timedResult = await call('tap', { expectedState: { ...timed, timeoutMs: 100 } })
    assert.equal(timedResult.condition.reason, 'CONDITION_TIMEOUT')
    assert.equal(timedResult.dispatch_started, false)
    assert.equal(nativeInputs().length, inputs, 'late observation never dispatches')
    const budgeted = baseline()
    readDelay = 180
    const separate = await call('tap', { expectedState: budgeted, actionTimeoutMs: 150 })
    assert.equal(separate.success, true, 'condition read does not consume the action budget')
    const outerExpected = baseline()
    readDelay = 180
    const outerInputs = nativeInputs().length
    const outer = await runWithBudget(150, () => call('tap', { expectedState: outerExpected, actionTimeoutMs: 5000 }))
    assert.equal(outer.success, false)
    assert.equal(nativeInputs().length, outerInputs, 'outer budget still prevents dispatch')

    // A matched condition cannot turn a native dispatch failure into success.
    const nativeFailure = baseline()
    process.env.MCP_CONDITION_INPUT_FAIL = '1'
    const failedInput = await call('tap', { expectedState: nativeFailure })
    delete process.env.MCP_CONDITION_INPUT_FAIL
    assert.equal(failedInput.success, false)
    assert.equal(failedInput.condition.status, 'matched')
    assert.equal(failedInput.dispatch_started, true)
    assert.equal(failedInput.delivery_status, 'unknown')

    const targetFailure = baseline()
    const notChecked = await call('tap_element', { expectedState: targetFailure, selector: undefined, elementId: 'missing' })
    assert.equal(notChecked.condition.status, 'not_checked')
    assert.equal(notChecked.condition.reason, 'ACTION_NOT_REACHED')

    const valid = baseline()
    const badConditions: unknown[] = [null, {}, { ...valid, extra: true }, { ...valid, snapshotRevision: 0 }, { ...valid, snapshotRevision: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, timeoutMs: 99 }, { ...valid, timeoutMs: '100' }, { ...valid, snapshotSessionId: '' }]
    for (const expectedState of badConditions) {
      const count = readFileSync(eventsPath, 'utf8').length
      const result = await call('tap', { expectedState })
      assert.match(result.error.message, /INVALID_ARGUMENT/)
      assert.equal(readFileSync(eventsPath, 'utf8').length, count)
    }
    for (const extra of [{ platform: undefined }, { deviceId: 'booted' }, { deviceId: 'default' }, { deviceId: ' ' }, { platform: ['android'] }]) {
      const result = await call('tap', { ...extra, expectedState: valid })
      assert.match(result.error.message, /INVALID_ARGUMENT/)
    }
    for (const name of ['start_app', 'restart_app', 'terminate_app', 'reset_app_data', 'scroll_to_element', 'adjust_control', 'get_ui_tree']) {
      const result = payload(await handleToolCall(name, { platform, deviceId: 'fixture', expectedState: valid }))
      assert.match(result.error.message, /INVALID_ARGUMENT/)
    }
    for (const tool of toolDefinitions) {
      assert.equal(!!tool.inputSchema.properties.expectedState, ['tap', 'tap_element', 'swipe', 'type_text', 'press_back'].includes(tool.name))
    }
    for (const responseMode of ['compact', 'debug']) {
      const expectedState = baseline()
      uiState = 'Changed'
      const before = nativeInputs().length
      const journey = payload(await handleToolCall('run_journey', { platform, deviceId: 'fixture', responseMode, defaults: { verificationMode: 'light' }, steps: [
        { id: 'ready', type: 'wait', selector: { accessibility_id: 'target' }, timeoutMs: 500 },
        { id: 'guarded', type: 'tap', selector: { accessibility_id: 'target' }, expectedState },
        { id: 'later', type: 'assert', assertion: { kind: 'element_visible', selector: { accessibility_id: 'target' } } }
      ] }))
      assert.equal(journey.stopped_at_step_id, 'guarded')
      assert.equal(journey.steps[0].status, 'passed')
      assert.equal(journey.steps[1].result.failure_code, 'PRECONDITION_FAILED')
      assert.equal(journey.steps[1].result.condition.observed.elements[0].text, 'Changed')
      assert.equal(journey.steps[1].result.verification.status, 'not_requested')
      assert.equal(journey.steps[2].status, 'not_run')
      assert.equal(nativeInputs().length, before)
    }
    // Calls overlap, but only the request with its own expectation is rejected.
    const overlapping = baseline()
    uiState = 'Changed'
    const before = nativeInputs().length
    const [guarded, unguarded] = await Promise.all([call('tap', { expectedState: overlapping }), call('tap')])
    assert.equal(guarded.failure_code, 'PRECONDITION_FAILED')
    assert.equal(unguarded.success, true)
    assert.equal(unguarded.condition, undefined)
    assert.equal(nativeInputs().length, before + 1)
    assert.equal(getSnapshotSessionId(), valid.snapshotSessionId)
    // Complete native observation + input paths with fake platform tools, including
    // subprocess timeout cleanup. No mocked tree or adapter is used in these checks.
    ToolsObserve.getUITreeHandler = originalTree
    for (platform of ['android', 'ios'] as const) {
      delete process.env.MCP_CONDITION_TREE_TEXT
      const observed: any = await ToolsObserve.getUITreeHandler({ platform, deviceId: 'fixture' })
      assert.equal(observed.error, undefined)
      const expectedState = { snapshotSessionId: observed.snapshot_session_id, snapshotRevision: observed.snapshot_revision }
      const matched = await call('tap', { expectedState })
      assert.equal(matched.success, true, JSON.stringify(matched))
      process.env.MCP_CONDITION_TREE_TEXT = 'Changed through native hierarchy'
      const before = nativeInputs().length
      const mismatch = await call('tap', { expectedState })
      assert.equal(mismatch.failure_code, 'PRECONDITION_FAILED', JSON.stringify(mismatch))
      assert.equal(mismatch.condition.observed.elements[0].text, 'Changed through native hierarchy')
      assert.equal(nativeInputs().length, before)
      const compact: any = await ToolsObserve.getUITreeHandler({ platform, deviceId: 'fixture', responseMode: 'compact' })
      assert.equal(compact.snapshot_session_id, expectedState.snapshotSessionId)
      const current: any = await ToolsObserve.getUITreeHandler({ platform, deviceId: 'fixture' })
      process.env.MCP_CONDITION_SLOW = '1'
      writeFileSync(changedPath, '')
      const unavailable = await call('tap', { expectedState: { snapshotSessionId: current.snapshot_session_id, snapshotRevision: current.snapshot_revision, timeoutMs: 1200 } })
      delete process.env.MCP_CONDITION_SLOW
      assert.equal(unavailable.condition.reason, 'CONDITION_TIMEOUT', JSON.stringify(unavailable))
      assert.equal(unavailable.dispatch_started, false)
      assert.equal(readFileSync(changedPath, 'utf8'), 'closed', 'timed-out hierarchy subprocess closed before response')
      assert.equal(nativeInputs().length, before)
    }
    console.log('Conditional actions: PASS (production Android/iOS input adapters with fake native tools)')
  } finally {
    ToolsObserve.getUITreeHandler = originalTree
    ToolsObserve.getScreenFingerprintHandler = originalFingerprint
    ToolsNetwork.notifyActionStart = originalNotify
    _resetDeviceListersForTests()
    resetSnapshotMetadataForTests()
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
    rmSync(directory, { recursive: true, force: true })
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
