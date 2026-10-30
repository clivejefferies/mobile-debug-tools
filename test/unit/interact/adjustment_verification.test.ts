import assert from 'node:assert/strict'
import type { ExpectStateResponse } from '../../../src/types.js'
import { verifyAdjustment, type AdjustmentVerificationInput } from '../../../src/interact/adjustment-verification.js'

const input: AdjustmentVerificationInput = {
  labeled: false, currentEl: { state: { value: 10 } },
  actualState: { property: 'value', value: 10 }, property: 'value', target: 20, tolerance: 0.5,
  expectation: { element_id: 'control', property: 'value', expected: 20, platform: 'android', deviceId: 'fixture' }
}
let observations = 0
let assertions = 0
const verified = await verifyAdjustment(input, {
  observe: async () => { throw new Error('ordinary verification must use the assertion boundary') },
  expectState: async args => {
    assertions++
    assert.equal(args.element_id, 'control')
    return { success: false, observed_state: { value: 20.25 }, reason: 'exact comparison failed' } as ExpectStateResponse
  }
})
assert.equal(assertions, 1)
assert.equal(verified.withinTolerance, true, 'numeric tolerance is independent of exact assertion success')
assert.equal(verified.observedState?.value, 20.25)
const stale = await verifyAdjustment({ ...input, labeled: true, actualState: { property: 'value', value: 20 } }, {
  observe: async () => { observations++; return { elements: [] } },
  expectState: async () => { throw new Error('label verification must acquire a new tree') }
})
assert.equal(observations, 1)
assert.equal(stale.withinTolerance, false, 'fallback state must not establish fresh convergence')
assert.equal(stale.verification.success, false)
assert.equal(stale.observedState?.value, 20, 'last readable state remains available for diagnostics')
await assert.rejects(verifyAdjustment(input, {
  observe: async () => null,
  expectState: async () => { throw new Error('ACTION_TIMEOUT') }
}), /ACTION_TIMEOUT/, 'timeouts propagate without manufacturing an observation')
console.log('PASS adjustment verification dependencies, tolerance, freshness and timeout preservation')
