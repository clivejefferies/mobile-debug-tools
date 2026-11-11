import assert from 'node:assert/strict'
import { parseMetric, summarizeAttempts, unionDuration, observationOverhead, type Attempt } from '../../device/automated/latency/end-to-end-report.js'
import { validObservation } from '../../device/automated/latency/end-to-end-session.js'

assert.equal(unionDuration([{ stage: 'parent', start_ms: 1, end_ms: 10 }, { stage: 'nested', start_ms: 2, end_ms: 5 },
  { stage: 'overlap', start_ms: 8, end_ms: 12 }], 11), 10)
const attempts: Attempt[] = [
  { case: 'full', iteration: 0, warmup: true, success: false, setup_ms: 1, requests: [] },
  { case: 'full', iteration: 1, warmup: false, success: false, setup_ms: 1, requests: [] },
  { case: 'full', iteration: 2, warmup: false, success: true, setup_ms: 500, requests: [
    { tool: 'run_journey', elapsed_ms: 100, response_bytes: 50, success: true, tree: [], metrics: [
      { event: 'latency_metric', request_id: 'opaque', tool: 'run_journey', handler_completed: true, elapsed_ms: 90,
        spans: [{ stage: 'parent', start_ms: 0, end_ms: 80 }, { stage: 'child', start_ms: 10, end_ms: 70 }] }
    ] }
  ] },
  { case: 'empty', iteration: 1, warmup: false, success: false, setup_ms: 0, requests: [] }
]
const report = summarizeAttempts(attempts)
assert.equal(report.full.total_ms?.p50, 100)
assert.equal(report.full.failures, 1)
assert.equal(report.full.warmup_failures, 1)
assert.equal(report.full.handler_unattributed_ms?.p50, 10)
assert.equal(report.full.client_minus_handler_ms?.p50, 10)
assert.equal(report.empty.total_ms, null)
assert.equal(observationOverhead(attempts).tree.paired_on_minus_off_ms, null)
const observation = (name: string, elapsed: number, success = true): Attempt => ({ case: name, iteration: 3, warmup: false,
  success, setup_ms: 0, requests: [{ tool: 'get_ui_tree', elapsed_ms: elapsed, success, metrics: [], tree: [] }] })
assert.equal(observationOverhead([observation('tree-on', 15), observation('tree-off', 20)]).tree.paired_on_minus_off_ms?.p50, -5)
assert.equal(observationOverhead([observation('tree-on', 15), observation('tree-off', 20, false)]).tree.paired_on_minus_off_ms, null)
assert.equal(parseMetric('secret stderr'), null)
assert.equal(parseMetric('{"event":"latency_metric","tool":"tap","spans":[]}'), null)
assert.equal(parseMetric('{"event":"unrecognized","secret":"credential"}'), null)
const filtered = parseMetric(JSON.stringify({ event: 'latency_metric', tool: 'tap', request_id: 'opaque', handler_completed: true,
  elapsed_ms: 10, arguments: { deviceId: 'private-device', text: 'secret' }, stdout: 'secret',
  spans: [{ stage: 'dispatch_ms', start_ms: 0, end_ms: 8, secret: 'credential' }] }))
assert.ok(filtered)
assert.ok(!JSON.stringify(filtered).includes('secret'))
assert.ok(!JSON.stringify(filtered).includes('private-device'))
const tree = { device: { id: 'emulator-fixture' }, elements: [{}] }
assert.equal(validObservation('get_ui_tree', tree, [], 'emulator-fixture'), true)
assert.equal(validObservation('get_ui_tree', tree, [], 'other-device'), false)
assert.equal(validObservation('get_ui_tree', {}, [], 'emulator-fixture'), false)
assert.equal(validObservation('capture_screenshot', { device: { id: 'emulator-fixture' } }, [], 'emulator-fixture'), false)
assert.equal(validObservation('capture_debug_snapshot', { raw: { ui_tree: tree, fingerprint_error: 'failed' } }, [], 'emulator-fixture'), false)
assert.equal(validObservation('capture_debug_snapshot', { raw: { ui_tree: tree } }, [], 'emulator-fixture'), true)
console.log('End-to-end benchmark accounting/privacy: PASS')
