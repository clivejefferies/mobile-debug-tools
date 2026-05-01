import assert from 'assert'
import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting expect_* unit tests...')
  const originalGetScreenFingerprintHandler = (Observe as any).ToolsObserve.getScreenFingerprintHandler
  const originalGetCurrentScreenHandler = (Observe as any).ToolsObserve.getCurrentScreenHandler
  const originalGetUITreeHandler = (Observe as any).ToolsObserve.getUITreeHandler
  const originalWaitForUIHandler = (ToolsInteract as any).waitForUIHandler

  try {
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: 'fp_home', activity: 'com.example.HomeActivity' })
    let expectScreen = await ToolsInteract.expectScreenHandler({ platform: 'android', fingerprint: 'fp_home' })
    assert.strictEqual(expectScreen.success, true)
    assert.deepStrictEqual(expectScreen.observed_screen, { fingerprint: 'fp_home', screen: 'com.example.HomeActivity' })
    assert.deepStrictEqual(expectScreen.expected_screen, { fingerprint: 'fp_home', screen: null })
    assert.strictEqual(expectScreen.confidence, 1)
    assert.deepStrictEqual(expectScreen.comparison, {
      basis: 'fingerprint',
      matched: true,
      reason: 'observed fingerprint matches expected fingerprint fp_home'
    })
    assert.strictEqual(expectScreen.trace.final_outcome, 'success')
    assert.strictEqual(expectScreen.trace.steps[0].stage, 'verify')

    ;(Observe as any).ToolsObserve.getCurrentScreenHandler = async () => ({
      activity: 'com.example.HomeActivity',
      shortActivity: 'HomeActivity'
    })
    expectScreen = await ToolsInteract.expectScreenHandler({ platform: 'android', screen: 'HomeActivity' })
    assert.strictEqual(expectScreen.success, true)
    assert.strictEqual(expectScreen.observed_screen.screen, 'HomeActivity')
    assert.strictEqual(expectScreen.confidence, 1)
    assert.deepStrictEqual(expectScreen.comparison, {
      basis: 'screen',
      matched: true,
      reason: 'observed screen matches expected screen HomeActivity'
    })

    ;(ToolsInteract as any).waitForUIHandler = async () => ({
      status: 'success',
      element: {
        text: 'Ready',
        resource_id: 'rid_ready',
        accessibility_id: null,
        class: 'TextView',
        bounds: [0, 0, 10, 10],
        index: 0,
        elementId: 'el_ready'
      }
    })
    const expectElementVisible = await ToolsInteract.expectElementVisibleHandler({
      selector: { text: 'Ready' },
      platform: 'android'
    })
    assert.strictEqual(expectElementVisible.success, true)
    assert.strictEqual(expectElementVisible.element_id, 'el_ready')
    assert.strictEqual(expectElementVisible.element?.resource_id, 'rid_ready')
    assert.strictEqual(expectElementVisible.expected_condition, 'visible')
    assert.strictEqual(expectElementVisible.reason, 'selector is visible')
    assert.strictEqual(expectElementVisible.trace.final_outcome, 'success')
    assert.strictEqual(expectElementVisible.trace.steps[0].stage, 'verify')

    ;(ToolsInteract as any).waitForUIHandler = async () => ({
      status: 'timeout',
      error: { code: 'ELEMENT_NOT_FOUND', message: 'Condition visible not satisfied within timeout; observed 0 match(es)' },
      observed: {
        matched_count: 0,
        condition_satisfied: false,
        selected_index: null,
        last_matched_element: null
      }
    })
    const timeoutResult = await ToolsInteract.expectElementVisibleHandler({
      selector: { text: 'Missing' },
      platform: 'android'
    })
    assert.strictEqual(timeoutResult.success, false)
    assert.deepStrictEqual(timeoutResult.selector, { text: 'Missing' })
    assert.strictEqual(timeoutResult.element_id, null)
    assert.strictEqual(timeoutResult.expected_condition, 'visible')
    assert.deepStrictEqual(timeoutResult.observed, {
      status: 'timeout',
      matched_count: 0,
      condition_satisfied: false,
      selected_index: null,
      last_matched_element: null
    })
    assert.strictEqual(timeoutResult.reason, 'Condition visible not satisfied within timeout; observed 0 match(es)')
    assert.strictEqual(timeoutResult.failure_code, 'TIMEOUT')
    assert.strictEqual(timeoutResult.retryable, true)
    assert.strictEqual(timeoutResult.trace.final_outcome, 'failure')

    let uiTreeCallCount = 0
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => {
      uiTreeCallCount++
      return {
        device: { platform: 'android', id: 'emulator-5554' },
        captured_at_ms: Date.now(),
        elements: [{
          elementId: 'el_state',
          text: 'Stateful',
          resource_id: 'rid_state',
          accessibility_id: null,
          class: 'TextView',
          bounds: [0, 0, 10, 10],
          index: 0,
          state: { enabled: true, value: 7 }
        }]
      }
    }
    const expectState = await ToolsInteract.expectStateHandler({
      selector: { text: 'Stateful' },
      property: 'value',
      expected: 7,
      platform: 'android'
    })
    assert.strictEqual(expectState.success, true)
    assert.strictEqual(uiTreeCallCount >= 2, true)
    assert.ok(expectState.trace.steps.filter((step) => step.stage === 'stabilize').length >= 2)
    assert.ok(expectState.trace.steps.filter((step) => step.stage === 'verify').length >= 2)

    console.log('expect_* unit tests passed')
  } finally {
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = originalGetScreenFingerprintHandler
    ;(Observe as any).ToolsObserve.getCurrentScreenHandler = originalGetCurrentScreenHandler
    ;(Observe as any).ToolsObserve.getUITreeHandler = originalGetUITreeHandler
    ;(ToolsInteract as any).waitForUIHandler = originalWaitForUIHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
