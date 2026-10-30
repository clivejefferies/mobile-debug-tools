import assert from 'node:assert/strict'
import { adjustControl } from '../../../src/interact/adjustment.js'
import type { AdjustmentDependencies } from '../../../src/interact/adjustment-context.js'
import type { ActionTargetResolved, DeviceInfo } from '../../../src/types.js'
import type { UiElement } from '../../../src/interact/model.js'

const device: DeviceInfo = { platform: 'android', id: 'fixture', model: 'fixture', osVersion: 'fixture', simulator: true }
let value = 10
const calls: string[] = []
const element = (): UiElement => ({ visible: true, enabled: true, role: 'slider', stable_id: 'duration', bounds: [0, 0, 300, 40],
  state: { value, value_range: { min: 0, max: 100 } }, actions: ['set_value'] })
const handle = { elementId: 'handle', platform: 'android' as const, deviceId: device.id, bounds: [0, 0, 300, 40] as [number, number, number, number], index: 0, stable_id: 'duration' }
const target = (): ActionTargetResolved => ({ elementId: 'handle', text: null, resource_id: null, accessibility_id: null, class: 'Slider', bounds: handle.bounds, index: 0 })
const deps: AdjustmentDependencies = {
  observe: async () => ({ device, elements: [element()] }), fingerprint: async () => 'fingerprint',
  getHandle: () => handle, currentHandle: () => ({ el: element(), index: 0 }), target,
  wait: async () => { throw new Error('handle targeting must not use selector waits') },
  find: async () => { throw new Error('handle targeting must not use semantic search') },
  expectState: async input => {
    calls.push('verify')
    return { success: true, element_id: 'handle', expected_state: { property: input.property, expected: input.expected },
      observed_state: { property: input.property, value }, trace: { action_id: 'assertion', steps: [], final_outcome: 'success', attempts: 1 } }
  },
  service: async () => ({ resolved: { id: device.id }, interact: { setAdjustableValue: async () => { calls.push('semantic'); return { success: false } } } }),
  tap: async () => { calls.push('coordinate'); value = 20; return { success: true, device } },
  swipe: async () => { throw new Error('a converged coordinate adjustment must not dispatch a gesture') }
}
const already = await adjustControl({ element_id: 'handle', targetValue: 10 }, deps)
assert.equal(already.success, true)
assert.equal(already.attempts, 0)
assert.deepEqual(calls, [])
const adjusted = await adjustControl({ element_id: 'handle', targetValue: 20 }, deps)
assert.equal(adjusted.success, true)
assert.equal(adjusted.attempts, 2)
assert.equal(adjusted.adjustment_mode, 'coordinate')
assert.deepEqual(calls, ['semantic', 'coordinate', 'verify'], 'failed direct capability falls back in the established order')
calls.length = 0
const stale = await adjustControl({ element_id: 'missing', targetValue: 20 }, { ...deps, getHandle: () => undefined })
assert.equal(stale.success, false)
assert.equal(stale.failure_code, 'STALE_REFERENCE')
assert.deepEqual(calls, [], 'missing handles cannot dispatch native input')
console.log('PASS injected adjustment service: read-only convergence, strategy order, attempt accounting and stale-handle rejection')
