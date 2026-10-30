import assert from 'node:assert/strict'
import { ReadinessTracker } from '../../../src/observe/readiness.js'
import { getSnapshotSessionId } from '../../../src/observe/snapshot-metadata.js'

const device = { platform: 'android', id: 'fixture' }
const sample = (label = 'Ready', extra: any = {}) => ({ device, snapshot_session_id: getSnapshotSessionId(), snapshot_revision: 1,
  captured_at_ms: 10000, screen: '', resolution: { width: 100, height: 200 },
  elements: [{ type: 'Button', text: label, visible: true, enabled: true, bounds: [0, 0, 50, 50] }], ...extra })
const tracker = new ReadinessTracker('android', 'fixture')
assert.equal(tracker.observe(sample(), 10000, 0).state, 'unknown')
assert.equal(tracker.observe(sample(), 10000, 499).state, 'unknown')
assert.equal(tracker.observe(sample(), 10000, 500).state, 'settled')
assert.equal(tracker.observe(sample('Changed'), 10000, 1000).state, 'transitioning')
assert.equal(tracker.observe(sample('Changed'), 10000, 1500).state, 'settled')
for (const label of [' Loading… ', 'Please wait...', 'please   wait']) {
  const state = tracker.observe(sample(label), 10000, 2000)
  assert.equal(state.state, 'loading')
  assert.equal(state.basis, 'heuristic')
  assert.equal(tracker.observe(sample(label), 10000, 3000).state, 'loading', 'identical loaders never settle')
}
for (const type of ['android.widget.ProgressBar', 'ActivityIndicator', 'ProgressIndicator']) {
  const tree = sample('Progress', { elements: [{ type, visible: true }] })
  assert.equal(tracker.observe(tree, 10000, 4000).state, 'loading')
  assert.equal(tracker.summary.basis, 'observed')
}
assert.notEqual(tracker.observe(sample('Progress'), 10000, 5000).state, 'loading', 'legacy broad keywords are not loaders')
for (const extra of [{ error: 'offline' }, { elements: [] }, { captured_at_ms: 9999 }, { snapshot_session_id: 'old' }, { device: { ...device, id: 'other' } }, { resolution: { width: Infinity, height: 2 } }]) {
  assert.equal(tracker.observe(sample('Ready', extra), 10000, 6000).state, 'unknown')
  assert.equal(tracker.observe(sample(), 10000, 7000).state, 'unknown', 'failure breaks continuity')
  assert.equal(tracker.observe(sample(), 10000, 7500).state, 'settled')
}
for (let index = 0; index < 20; index++) tracker.observe(sample(), 10000, 8000 + index)
assert.equal(tracker.summary.evidence.length, 8)
assert.equal(tracker.summary.capabilities.unresponsive, false)
assert.equal(tracker.summary.capabilities.debugger_paused, true)
assert.ok(tracker.deadline().limitations.includes('DEADLINE_EXCEEDED'))
assert.equal(new ReadinessTracker('android', 'fixture').observe(sample(), 10000, 9000).state, 'unknown', 'no cross-request history')
assert.ok(!JSON.stringify(tracker.summary).includes('Ready'), 'evidence contains codes rather than private labels')
assert.equal(new ReadinessTracker('ios', 'fixture').summary.capabilities.debugger_paused, false)
assert.ok(tracker.summary.limitations.includes('MANAGED_DEBUGGER_ONLY'))
console.log('Readiness classifier: PASS')
