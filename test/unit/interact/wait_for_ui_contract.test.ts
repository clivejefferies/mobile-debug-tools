import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'
import assert from 'assert'

async function run() {
  console.log('Starting wait_for_ui contract tests...')
  const orig = (Observe as any).ToolsObserve.getUITreeHandler

  try {
    // success shape
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [ { text: 'OK', resourceId: 'rid', contentDescription: 'acc', type: 'TextView', bounds: [0,0,10,10], visible: true, clickable: false, enabled: true } ] })
    const s = await ToolsInteract.waitForUIHandler({ selector: { text: 'OK' }, condition: 'exists', timeout_ms: 500, poll_interval_ms: 50, platform: 'android' })
    // Assert contract fields for success
    assert.strictEqual(s.status, 'success', 'status must be success');
    assert.strictEqual(typeof s.matched, 'number', 'matched must be number');
    assert.ok(s.element, 'element must be present');
    assert.strictEqual(typeof s.element.elementId, 'string', 'elementId must be present');
    assert.ok(s.metrics && typeof s.metrics.latency_ms === 'number' && typeof s.metrics.poll_count === 'number' && typeof s.metrics.attempts === 'number', 'metrics must include latency_ms, poll_count, attempts');
    assert.ok(typeof s.element.bounds !== 'undefined' && s.element.bounds !== null, 'element.bounds must be present');

    // timeout shape
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [] })
    const t = await ToolsInteract.waitForUIHandler({ selector: { text: 'Nope' }, condition: 'exists', timeout_ms: 200, poll_interval_ms: 50, platform: 'android' })
    assert.strictEqual(t.status, 'timeout', 'status must be timeout on no match');
    assert.ok(t.error && t.error.code && t.error.message, 'timeout must include error with code and message');
    assert.ok(t.metrics && typeof t.metrics.latency_ms === 'number', 'timeout metrics must include latency_ms');

    console.log('wait_for_ui contract tests: PASS')
  } finally {
    ;(Observe as any).ToolsObserve.getUITreeHandler = orig
  }
}

run().catch(err => { console.error('wait_for_ui_contract tests failed:', err); process.exit(1) })
