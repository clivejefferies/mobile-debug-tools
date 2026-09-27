import assert from 'node:assert/strict'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsInteract } from '../../../src/interact/index.js'

async function run() {
  const originalWait = ToolsInteract.waitForUIHandler
  const originalTap = ToolsInteract.tapElementHandler
  let tapCount = 0
  let lastWait: any
  let resolution: any
  ToolsInteract.waitForUIHandler = async (args: any) => { lastWait = args; return resolution }
  ToolsInteract.tapElementHandler = async (args: any) => {
    tapCount++
    assert.equal(args.elementId, 'selected')
    assert.deepEqual(args.freshTree, { elements: [] })
    return { action_id: 'tap', action_type: 'tap_element', success: true, lifecycle_state: 'pending_verification' } as any
  }
  try {
    const selector = { accessibility_id: 'save' }
    resolution = { status: 'success', element: { elementId: 'selected' }, _tree: { elements: [] } }
    const success = JSON.parse((await handleToolCall('tap_element', {
      selector, platform: 'android', verificationMode: 'none', responseMode: 'compact'
    })).content[0].text!)
    assert.equal(success.success, true)
    assert.equal(tapCount, 1)
    assert.equal(lastWait.condition, 'clickable')
    assert.equal(lastWait.singleObservation, true)
    assert.equal(lastWait.singleAttempt, true)
    assert.equal(lastWait.rejectAmbiguous, true)

    await handleToolCall('tap_element', {
      selector, waitFor: { condition: 'visible', timeoutMs: 700, pollIntervalMs: 80 },
      platform: 'android', verificationMode: 'none', responseMode: 'compact'
    })
    assert.equal(lastWait.condition, 'visible')
    assert.equal(lastWait.timeout_ms, 700)
    assert.equal(lastWait.poll_interval_ms, 80)
    assert.equal(lastWait.singleAttempt, false)
    assert.equal(lastWait.rejectAmbiguous, false)
    assert.equal(tapCount, 2)

    resolution = { status: 'timeout', error: { code: 'AMBIGUOUS_TARGET' } }
    const ambiguous = JSON.parse((await handleToolCall('tap_element', {
      selector, platform: 'android', verificationMode: 'none', responseMode: 'compact'
    })).content[0].text!)
    assert.equal(ambiguous.failure_code, 'AMBIGUOUS_TARGET')
    assert.equal(tapCount, 2)

    resolution = { status: 'timeout', error: { code: 'ELEMENT_NOT_FOUND' } }
    const missing = JSON.parse((await handleToolCall('tap_element', {
      selector, platform: 'android', verificationMode: 'none', responseMode: 'compact'
    })).content[0].text!)
    assert.equal(missing.failure_code, 'ELEMENT_NOT_FOUND')
    assert.equal(missing.dispatch_started, false)
    assert.equal(missing.retryable, true)
    assert.equal(tapCount, 2)

    const invalid = await handleToolCall('tap_element', {
      elementId: 'old', selector, waitFor: {}, platform: 'android'
    })
    assert.match(JSON.parse(invalid.content[0].text!).error.message, /Invalid input/)
    assert.equal(tapCount, 2)
  } finally {
    ToolsInteract.waitForUIHandler = originalWait
    ToolsInteract.tapElementHandler = originalTap
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
