import assert from 'node:assert/strict'
import { withEvidence, evidenceDispatch, captureEvidence, completeJourneyVerification, withJourneyStepEvidence, refreshJourneyEvidence } from '../../../src/observe/evidence.js'
import { observedState } from '../../../src/server/handlers/compact-state.js'
import { finalizeCompactInteraction } from '../../../src/server/handlers/compact-interaction.js'
import { wrapResponse } from '../../../src/server/common.js'
import { interactionDiagnostics } from '../../../src/server/handlers/interaction-diagnostics.js'

const device = { platform: 'android' as const, id: 'fixture' }
await withEvidence({ journey: true }, async () => {
  const child = await withEvidence({ action: true }, async () => {
    await evidenceDispatch(device, async () => {})
    return { success: true, dispatch_started: true, verification: { mode: 'light', status: 'observed' } }
  })
  const assertion = await withJourneyStepEvidence(() => captureEvidence('ui_tree', device, async () => ({ success: true, device, snapshot_session_id: 'snapshot', snapshot_revision: 2 })))
  completeJourneyVerification(child.evidence.action_id!)
  const steps = [{ id: 'tap', type: 'tap', status: 'passed', success: true, result: { ...child.result, evidence: child.evidence } },
    { id: 'assert', type: 'assert', status: 'passed', success: true, result: assertion }]
  refreshJourneyEvidence(steps)
  assert.equal(observedState(steps[0].result.evidence, true).status, 'observed', 'following assertion supplies actual fresh evidence')
  const response = finalizeCompactInteraction('run_journey', {}, wrapResponse({ success: true, steps }))
  const compact = JSON.parse(response.content[0].text!)
  const ref = compact.steps[0].result.diagnostics
  const retained = interactionDiagnostics.lookup(ref.session_id, ref.result_id)
  assert.equal(retained.success, true)
  assert.equal(compact.steps[0].result.observed_state.status, 'observed')
  // A later action invalidates the first tap and assertion summaries at finalization.
  await withEvidence({ action: true }, () => evidenceDispatch(device, async () => {}))
  refreshJourneyEvidence(steps)
  assert.equal(observedState(steps[0].result.evidence, true).status, 'unknown')
  assert.equal(observedState(steps[1].result.evidence).status, 'unknown')
  const final = finalizeCompactInteraction('run_journey', {}, wrapResponse({ success: true, steps }))
  const result = JSON.parse(final.content[0].text!)
  assert.equal(result.steps[0].result.observed_state.freshness, 'stale')
  assert.equal(result.steps[1].result.observed_state.freshness, 'stale')
})
const error = { ...wrapResponse({ error: { code: 'TRACE_NOT_FOUND', message: 'Original failure' } }), isError: true }
finalizeCompactInteraction('run_journey', {}, error)
assert.equal(error.isError, true)
assert.equal(JSON.parse(error.content[0].text!).success, false)
console.log('PASS shared journey observation, final supersession, child diagnostics and MCP error signalling')
