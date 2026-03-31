import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting new wait_for_ui unit tests...')
  const origGetUITree = (Observe as any).ToolsObserve.getUITreeHandler

  try {
    // Test 1: exact text match -> exists
    (Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [ { text: 'Hello', resourceId: 'rid1', contentDescription: 'acc1', type: 'Button', bounds: [0,0,10,10], visible: true, clickable: false, enabled: true } ] })
    const r1 = await ToolsInteract.waitForUIHandler({ selector: { text: 'Hello' }, condition: 'exists', timeout_ms: 1000, poll_interval_ms: 50, platform: 'android' })
    const ok1 = r1 && r1.status === 'success' && r1.matched === 1 && r1.element && r1.element.text === 'Hello'
    console.log('Exact match exists:', ok1 ? 'PASS' : 'FAIL', JSON.stringify(r1, null, 2))

    // Test 2: contains matching
    (Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [ { text: 'Welcome User', resourceId: 'rid2', contentDescription: 'acc2', type: 'TextView', bounds: [0,0,50,10], visible: true } ] })
    const r2 = await ToolsInteract.waitForUIHandler({ selector: { text: 'User', contains: true }, condition: 'exists', timeout_ms: 1000, poll_interval_ms: 50, platform: 'android' })
    const ok2 = r2 && r2.status === 'success' && r2.matched === 1 && r2.element && r2.element.text && r2.element.text.includes('Welcome')
    console.log('Contains match:', ok2 ? 'PASS' : 'FAIL', JSON.stringify(r2, null, 2))

    // Test 3: visible condition
    (Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [ { text: 'Hidden', resourceId: 'rid3', bounds: [0,0,0,0], visible: false } ] })
    const r3 = await ToolsInteract.waitForUIHandler({ selector: { text: 'Hidden' }, condition: 'visible', timeout_ms: 300, poll_interval_ms: 50, platform: 'android' })
    const ok3 = r3 && r3.status === 'timeout' && r3.error && r3.error.code === 'ELEMENT_NOT_FOUND'
    console.log('Visible negative (hidden element):', ok3 ? 'PASS' : 'FAIL', JSON.stringify(r3, null, 2))

    // Test 4: clickable condition
    (Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [ { text: 'TapMe', resourceId: 'rid4', bounds: [0,0,20,20], visible: true, clickable: true, enabled: true } ] })
    const r4 = await ToolsInteract.waitForUIHandler({ selector: { text: 'TapMe' }, condition: 'clickable', timeout_ms: 1000, poll_interval_ms: 50, platform: 'android' })
    const ok4 = r4 && r4.status === 'success' && r4.matched === 1 && r4.element && r4.element.index === 0
    console.log('Clickable match:', ok4 ? 'PASS' : 'FAIL', JSON.stringify(r4, null, 2))

    // Test 5: retry behavior - first attempt times out, second attempt succeeds
    const start = Date.now()
    let seqTree = async () => {
      const now = Date.now()
      // for first ~400ms return no elements, afterwards return match
      if (now - start < 400) return { elements: [] }
      return { elements: [ { text: 'Retried', resourceId: 'rid5', bounds: [0,0,10,10], visible: true } ] }
    }
    ;(Observe as any).ToolsObserve.getUITreeHandler = seqTree
    const r5 = await ToolsInteract.waitForUIHandler({ selector: { text: 'Retried' }, condition: 'exists', timeout_ms: 200, poll_interval_ms: 50, match: undefined, retry: { max_attempts: 3, backoff_ms: 150 }, platform: 'android' })
    const ok5 = r5 && r5.status === 'success' && r5.metrics && r5.metrics.attempts >= 2
    console.log('Retry behavior:', ok5 ? 'PASS' : 'FAIL', JSON.stringify(r5, null, 2))

    // Test 6: timeout with no selector match -> correct error code
    (Observe as any).ToolsObserve.getUITreeHandler = async () => ({ elements: [] })
    const r6 = await ToolsInteract.waitForUIHandler({ selector: { text: 'Nope' }, condition: 'exists', timeout_ms: 300, poll_interval_ms: 50, retry: { max_attempts: 1 }, platform: 'android' })
    const ok6 = r6 && r6.status === 'timeout' && r6.error && r6.error.code === 'ELEMENT_NOT_FOUND'
    console.log('Timeout no match:', ok6 ? 'PASS' : 'FAIL', JSON.stringify(r6, null, 2))

  } finally {
    (Observe as any).ToolsObserve.getUITreeHandler = origGetUITree
  }
}

run().catch(err => { console.error('wait_for_ui_new tests failed:', err); process.exit(1) })
