import assert from 'node:assert/strict'
import type { Clock } from '../../../src/runtime/clock.js'
import type { UiTree } from '../../../src/interact/observation.js'
import { waitForUI } from '../../../src/interact/waits/ui-wait.js'
import { waitForScreenChange } from '../../../src/interact/waits/screen-wait.js'
import { findElement } from '../../../src/interact/targeting/find-element.js'
import { expectState } from '../../../src/interact/assertions/state-assertion.js'
import { _resolvedTargetFromElement } from '../../../src/interact/targeting/element-helpers.js'

function fakeClock() {
  let now = 1000
  const delays: number[] = []
  const clock: Clock = { now: () => now, sleep: async ms => { delays.push(ms); now += ms } }
  return { clock, delays }
}
const resolve = (_platform: string, _device: string | undefined, element: NonNullable<UiTree['elements']>[number], index: number) => _resolvedTargetFromElement('test-id', element, index)
const present = (clock: Clock): UiTree => ({ captured_at_ms: clock.now(), elements: [{ text: 'Button', state: { enabled: true } }] })

{
  const { clock, delays } = fakeClock()
  const result = await waitForUI({ selector: { text: 'Button' }, timeout_ms: 500, poll_interval_ms: 50 }, {
    clock, observe: async () => present(clock), resolve
  })
  assert.equal(result?.status, 'success')
  assert.deepEqual(result?.metrics, { latency_ms: 50, poll_count: 2, attempts: 1 })
  assert.deepEqual(delays, [50])
}
{
  const { clock, delays } = fakeClock()
  const result = await waitForUI({ selector: { text: 'missing' }, timeout_ms: 100, poll_interval_ms: 50,
    retry: { max_attempts: 2, backoff_ms: 20 } }, { clock, observe: async () => ({ elements: [] }), resolve })
  assert.equal(result?.status, 'timeout')
  assert.deepEqual(result?.metrics, { latency_ms: 320, poll_count: 6, attempts: 2 })
  assert.deepEqual(delays, [50, 50, 50, 20, 50, 50, 50])
}
{
  const { clock, delays } = fakeClock()
  let samples = 0
  const result = await waitForScreenChange({ previousFingerprint: 'old', timeoutMs: 500, pollIntervalMs: 50 }, {
    clock, fingerprint: async () => ({ fingerprint: samples++ === 0 ? 'old' : 'new' })
  })
  assert.equal(result.success, true)
  assert.equal(result.elapsedMs, 100)
  assert.deepEqual(delays, [50, 50])
}
{
  const { clock, delays } = fakeClock()
  const result = await findElement({ query: 'missing', timeoutMs: 200 }, async () => ({ elements: [] }), clock)
  assert.equal(result.found, false)
  assert.deepEqual(delays, [100, 100, 100])
}
{
  const { clock, delays } = fakeClock()
  const result = await expectState({ selector: { text: 'Button' }, property: 'enabled', expected: true }, {
    clock, observe: async () => present(clock), getHandle: () => undefined,
    currentHandle: () => null, target: (platform, device, match) => resolve(platform, device, match.el, match.idx)
  })
  assert.equal(result.success, true)
  assert.equal(result.stabilization_window_ms, 150)
  assert.deepEqual(delays, [150])
  assert(result.trace.steps.every(step => step.timestamp >= 1000 && step.timestamp <= 1150))
}
console.log('PASS injected clocks: wait stability, retry/backoff deadlines, screen confirmation, search expiry and state trace timestamps without global timer replacement')
