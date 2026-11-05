import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { actionHandler } from '../../../src/server/handlers/action-execution.js'
import { toolHandlers, handleToolCall } from '../../../src/server/handlers/tool-handlers.js'
import { wrapResponse } from '../../../src/server/common.js'
import { withDeviceReadinessProbe } from '../../../src/observe/device-readiness.js'
import { captureEvidence, evidenceDispatch } from '../../../src/observe/evidence.js'
import { markDispatchStarted } from '../../../src/utils/operation-budget.js'
import { observedState } from '../../../src/server/handlers/compact-state.js'
import { finalizeCompactInteraction } from '../../../src/server/handlers/compact-interaction.js'

const device = { platform: 'android' as const, id: 'fixture-emulator' }
const original = toolHandlers.tap
let dispatches = 0
const decode = (r: Awaited<ReturnType<typeof handleToolCall>>) => JSON.parse(r.content[0].text!)
const lookup = async (value: ReturnType<typeof decode>) => decode(await handleToolCall('get_interaction_diagnostics', { sessionId: value.diagnostics.session_id, resultId: value.diagnostics.result_id }))
try {
  const baselines = [1129, 1639, 1157, 1106]
  for (const [index, kind] of ['success-none', 'success-observed', 'failed-dispatch', 'blocked-before-dispatch'].entries()) {
    toolHandlers.tap = actionHandler('tap', async () => {
      if (kind !== 'blocked-before-dispatch') await evidenceDispatch(device, async () => { markDispatchStarted(); dispatches++ })
      if (kind === 'success-observed') await captureEvidence('fingerprint', device, async () => ({ device, fingerprint: 'screen-after' }))
      return wrapResponse({ device, success: kind.startsWith('success'), lifecycle_state: kind === 'success-observed' ? 'verified' : 'pending_verification',
        ...(kind === 'failed-dispatch' ? { failure_code: 'ACTION_TIMEOUT', retryable: false, details: { error: 'original timeout details' } } : {}),
        ...(kind === 'blocked-before-dispatch' ? { failure_code: 'ELEMENT_NOT_FOUND', retryable: true } : {}) })
    })
    const response = await withDeviceReadinessProbe(async (_cmd, args) => ({ exitCode: 0, stderr: '', stdout: args.includes('power') ? 'mWakefulness=Awake\nmWakefulnessChanging=false' : 'KeyguardServiceDelegate\n showing=false' }), () => handleToolCall('tap', { platform: 'android', deviceId: device.id, responseMode: 'compact', verificationMode: index === 1 ? 'full' : 'none' }))
    const result = decode(response), size = Buffer.byteLength(response.content[0].text!)
    assert.ok(size <= 1280 + Buffer.byteLength(device.id), `${kind} exceeds budget: ${size}`)
    assert.ok(size <= baselines[index] * .8, `${kind} needs 20% reduction: ${size}`)
    assert.equal(result.observed_state.status, index === 1 ? 'observed' : 'unknown')
    assert.equal(result.device_readiness.input_ready, null)
    assert.equal(result.evidence.observations, undefined)
    const before = dispatches, diagnostic = await lookup(result)
    assert.equal(diagnostic.success, true)
    assert.equal(dispatches, before, 'lookup must not replay input')
    assert.equal(diagnostic.result.evidence.action_id, result.action_id)
    if (index === 2) { assert.equal(result.delivery_status, 'unknown'); assert.equal(result.retryable, false); assert.equal(diagnostic.result.details.error, 'original timeout details') }
    if (index === 3) assert.equal(result.dispatch_started, false)
    console.log(`${kind}: ${size} bytes, ~${Math.ceil(size / 4)} tokens (bytes/4 estimate)`)
  }
} finally { toolHandlers.tap = original }
const stamp = Date.now(), evidence = { session_id: randomUUID(), action_id: randomUUID(), correlation_id: randomUUID(), device, dispatch_completed_at_ms: stamp,
  observations: [{ kind: 'ui_tree', status: 'captured', freshness: 'fresh', device, capture_started_at_ms: stamp + 1, source_captured_at_ms: stamp + 2, snapshot_session_id: randomUUID(), snapshot_revision: 4 }] }
assert.equal(observedState(evidence, true).status, 'observed')
for (const patch of [{ freshness: 'stale' }, { freshness: 'unknown' }, { source_captured_at_ms: null }, { status: 'failed' }, { device: { ...device, id: 'other' } }, { capture_started_at_ms: stamp - 1 }]) {
  assert.equal(observedState({ ...evidence, observations: [{ ...evidence.observations[0], ...patch }] }, true).status, 'unknown')
}
const heavy = { success: false, failure_code: 'PRECONDITION_FAILED', dispatch_started: false, delivery_status: 'not_delivered', verification: { status: 'not_requested' }, evidence,
  device_readiness: { wakefulness: 'asleep', lock_state: 'locked', input_ready: false, blockers: ['DEVICE_ASLEEP', 'DEVICE_LOCKED'], limitations: [] },
  condition: { status: 'mismatch', reason: 'STATE_CHANGED', observed: { elements: Array(1000).fill({ text: '私'.repeat(100) }) } },
  state_delta: { added: Array(1000).fill({ text: 'private' }), changed: [], removed: [], snapshot_revision: 4, truncated: true }, actual_state: '😀'.repeat(100) }
const response = finalizeCompactInteraction('tap', { responseMode: 'compact' }, wrapResponse(heavy)), compact = decode(response)
assert.ok(Buffer.byteLength(response.content[0].text!) <= 1280 + device.id.length)
assert.deepEqual(compact.device_readiness.blockers, ['DEVICE_ASLEEP', 'DEVICE_LOCKED'])
assert.equal(compact.condition.observed?.elements, undefined)
assert.equal((await lookup(compact)).result.condition.observed.elements.length, 1000)
const debug = wrapResponse(heavy), unchanged = debug.content[0].text
finalizeCompactInteraction('tap', { responseMode: 'debug' }, debug)
assert.equal(debug.content[0].text, unchanged)
const steps = Array.from({ length: 50 }, (_, i) => ({ id: `${i}-😀`.repeat(100), type: 'tap', status: 'failed', success: false, result: heavy }))
const journeyResponse = finalizeCompactInteraction('run_journey', {}, wrapResponse({ success: false, stopped_at_step_id: steps[0].id, steps, evidence })), journey = decode(journeyResponse)
assert.equal(journey.steps.length, 50)
assert.deepEqual(journey.steps.map((s: { id: string }) => s.id), steps.map(s => s.id))
assert.ok(Buffer.byteLength(journeyResponse.content[0].text!) <= 1280 + 1280 * 50 + steps.reduce((n, s) => n + 2 * Buffer.byteLength(s.id), 0))
assert.equal(journey.diagnostics.available, false, 'oversized original journey reports unavailable explicitly')
console.log('PASS final compact budgets, freshness, no replay, diagnostic fidelity, huge conditions/deltas, multibyte values, 50-step IDs and debug compatibility')
const controlId = '\u0001'.repeat(3000)
const escaped = finalizeCompactInteraction('run_journey', {}, wrapResponse({ success: false, stopped_at_step_id: controlId,
  steps: [{ id: controlId, type: 'assert', status: 'failed', success: false, result: { success: false, observed_state: { property: 'checked', value: false }, evidence } }], evidence }))
const escapedJourney = decode(escaped)
assert.equal(escapedJourney.steps[0].id, controlId)
assert.deepEqual(escapedJourney.steps[0].result.observed, { property: 'checked', value: false })
assert.ok(Buffer.byteLength(escaped.content[0].text!) <= 2560 + 2 * (Buffer.byteLength(JSON.stringify(controlId)) - 2) + 2 * device.id.length)
const maximal = { ...heavy, action_id: randomUUID(), action_type: 'scroll_to_element', lifecycle_state: 'pending_verification', retryable: false,
  verification: { mode: 'light', status: 'unavailable' }, verification_diagnostic: { code: 'VERIFICATION_UNAVAILABLE', retryable: true },
  device_readiness: { wakefulness: 'transitioning', lock_state: 'unknown', input_ready: false,
    blockers: ['DEVICE_ASLEEP', 'DEVICE_LOCKED', 'DEVICE_TRANSITIONING', 'DEBUGGER_PAUSED'],
    limitations: ['DEVICE_WAKEFULNESS_UNVERIFIED', 'DEVICE_LOCK_OBSERVATION_UNAVAILABLE', 'DEVICE_LOCK_OBSERVATION_FAILED'] },
  evidence: { ...evidence, trace_context: { trace_id: randomUUID() } }, error: { code: 'UNKNOWN', message: '\u0001'.repeat(1000) } }
const maximalResponse = finalizeCompactInteraction('tap', { responseMode: 'compact' }, wrapResponse(maximal))
assert.ok(Buffer.byteLength(maximalResponse.content[0].text!) <= 1280 + device.id.length, maximalResponse.content[0].text!)
assert.deepEqual(decode(maximalResponse).device_readiness.blockers, maximal.device_readiness.blockers)
const maximalSteps = Array.from({ length: 50 }, (_, i) => ({ id: `max-${i}`, type: 'tap', status: 'failed', success: false, result: maximal }))
const maximalJourney = finalizeCompactInteraction('run_journey', {}, wrapResponse({ success: false, stopped_at_step_id: 'max-0', steps: maximalSteps, evidence }))
assert.ok(Buffer.byteLength(maximalJourney.content[0].text!) <= 1280 + 1280 * 50 + maximalSteps.reduce((n, s) => n + Buffer.byteLength(s.id), 0) + Buffer.byteLength('max-0') + 51 * device.id.length,
  `maximal 50-step response exceeded budget: ${Buffer.byteLength(maximalJourney.content[0].text!)}`)
