import assert from 'node:assert/strict'
import { deviceForwards, reportAfterCleanup } from '../../device/automated/debugger/coroutine-lifecycle.js'

const baseline = deviceForwards('emulator-5554 tcp:2 jdwp:20\nemulator-5554 tcp:1 jdwp:10\nother-device tcp:3 jdwp:30', 'emulator-5554')
assert.deepEqual(deviceForwards('other-device tcp:4 jdwp:40\nemulator-5554  tcp:1  jdwp:10\nemulator-5554 tcp:2 jdwp:20\n', 'emulator-5554'), baseline)
assert.notDeepEqual(deviceForwards('emulator-5554 tcp:1 jdwp:10', 'emulator-5554'), baseline)
assert.deepEqual(deviceForwards('emulator-55540 tcp:1 jdwp:10', 'emulator-5554'), [])

const order: string[] = []
await reportAfterCleanup(async () => { order.push('work'); return 42 }, async () => { order.push('cleanup') }, (status, result) => {
  order.push(status)
  assert.equal(result, 42)
})
assert.deepEqual(order, ['work', 'cleanup', 'PASS'])

// Reproduce the review bug: cleanup rejects after work succeeds or fails.
// The runner must reject and emit only FAIL in both cases.
for (const workFails of [false, true]) {
  const records: string[] = []
  const cleanupError = new Error('cleanup')
  const journeyError = new Error('journey')
  await assert.rejects(reportAfterCleanup(async () => {
    if (workFails) throw journeyError
    return 42
  }, async () => { throw cleanupError }, (status, evidence, error) => {
    records.push(status)
    assert.equal(evidence, undefined)
    if (workFails) {
      assert.ok(error instanceof AggregateError)
      assert.deepEqual(error.errors, [journeyError, cleanupError])
    } else assert.equal(error, cleanupError)
  }), error => workFails ? error instanceof AggregateError : error === cleanupError)
  assert.deepEqual(records, ['FAIL'])
}
let cleaned = false
const workError = new Error('journey')
await assert.rejects(reportAfterCleanup(async () => { throw workError }, async () => { cleaned = true }, (status, evidence, error) => {
  assert.equal(cleaned, true)
  assert.equal(status, 'FAIL')
  assert.equal(evidence, undefined)
  assert.equal(error, workError)
}), error => error === workError)
console.log('PASS coroutine assessment: cleanup precedes PASS; work/cleanup failures report FAIL; forwards scoped and sorted')
