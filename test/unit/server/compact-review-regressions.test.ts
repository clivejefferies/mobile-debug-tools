import assert from 'node:assert/strict'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { captureEvidence, withJourneyStepEvidence } from '../../../src/observe/evidence.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import { runWithBudget, remainingBudget } from '../../../src/utils/operation-budget.js'
import { finalizeCompactInteraction } from '../../../src/server/handlers/compact-interaction.js'
import { wrapResponse } from '../../../src/server/common.js'

const device = { platform: 'android' as const, id: 'fixture', model: 'Fixture', osVersion: '16', simulator: true }
const originalWait = ToolsInteract.waitForUIHandler
const decode = (response: Awaited<ReturnType<typeof handleToolCall>>) => JSON.parse(response.content[0].text!)
const diagnostics = async (value: ReturnType<typeof decode>) => {
  const response = decode(await handleToolCall('get_interaction_diagnostics', {
    sessionId: value.diagnostics.session_id, resultId: value.diagnostics.result_id
  }))
  assert.equal(response.success, true)
  return response.result
}
_setDeviceListersForTests({ listAndroidDevices: async () => [device] })
try {
  for (const responseMode of ['compact', 'debug']) for (const type of ['assert', 'wait']) for (const thrown of [true, false]) {
    let reads = 0
    ToolsInteract.waitForUIHandler = async () => {
      reads++
      await captureEvidence('ui_tree', device, async () => ({ device, snapshot_session_id: 'captured-before-timeout', snapshot_revision: 7 }))
      if (thrown) return runWithBudget(0, async () => { remainingBudget(); throw new Error('unreachable') })
      return { status: 'timeout', error: { code: 'TIMEOUT', message: 'returned timeout' }, observed: { matched_count: 0 } }
    }
    const result = decode(await handleToolCall('run_journey', { platform: 'android', deviceId: device.id, responseMode, steps: [
      { id: 'fails', type, ...(type === 'assert' ? { assertion: { kind: 'element_visible', selector: { text: 'Ready' } } } : { selector: { text: 'Ready' } }) },
      { id: 'later', type: 'wait', selector: { text: 'Later' } }
    ] }))
    assert.equal(result.success, false)
    assert.equal(result.stopped_at_step_id, 'fails')
    assert.equal(result.steps[1].status, 'not_run')
    assert.equal(reads, 1, 'neither a failure nor diagnostics lookup replays the observation')
    const step = responseMode === 'compact' ? await diagnostics(result.steps[0].result) : result.steps[0].result
    if (thrown) {
      assert.equal(step.failure_code, type === 'assert' ? 'ASSERTION_TIMEOUT' : 'STEP_FAILED')
      assert.equal(step.error, 'ACTION_TIMEOUT')
    } else if (type === 'assert') {
      assert.equal(step.failure_code, 'ASSERTION_TIMEOUT')
      assert.equal(step.reason, 'returned timeout')
      assert.equal(step.observed.matched_count, 0)
    } else {
      assert.equal(step.status, 'timeout')
      assert.deepEqual(step.error, { code: 'TIMEOUT', message: 'returned timeout' })
    }
    if (responseMode === 'compact') {
      const observation = step.evidence.observations[0]
      assert.equal(observation.kind, 'ui_tree')
      assert.equal(observation.status, 'captured')
      assert.equal(observation.snapshot_revision, 7)
      assert.equal(observation.snapshot_session_id, 'captured-before-timeout')
      assert.deepEqual(observation.device, { platform: device.platform, id: device.id })
      const journey = await diagnostics(result)
      assert.deepEqual(journey.steps[0].result.evidence, step.evidence, 'journey and child diagnostics retain the same final evidence')
    } else assert.equal(step.evidence, undefined, 'debug step shape is unchanged')
    assert.equal(reads, 1)
  }
} finally {
  ToolsInteract.waitForUIHandler = originalWait
  _resetDeviceListersForTests()
}
const originalError = new Error('outside evidence context')
await assert.rejects(withJourneyStepEvidence(async () => { throw originalError }), error => error === originalError)
for (const message of ['short error', 'a'.repeat(128), 'a'.repeat(129), '😀'.repeat(33)]) {
  const response = finalizeCompactInteraction('run_journey', {}, wrapResponse({ error: { code: 'FIXTURE_ERROR', message } }))
  const result = decode(response)
  const shortened = Buffer.byteLength(message) > 128
  assert.equal(result.truncated, shortened ? true : undefined)
  assert.equal(result.error.code, 'FIXTURE_ERROR')
  assert.ok(Buffer.byteLength(result.error.message) <= 128)
  assert.ok(Buffer.byteLength(response.content[0].text!) < 1280, 'truncation must be marked even without overall budget pressure')
  assert.equal((await diagnostics(result)).error.message, message)
}
console.log('PASS thrown journey evidence, returned-timeout/debug compatibility, and ASCII/multibyte journey error truncation')
