import assert from 'assert'
import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting expect_* unit tests...')
  const originalGetScreenFingerprintHandler = (Observe as any).ToolsObserve.getScreenFingerprintHandler
  const originalGetCurrentScreenHandler = (Observe as any).ToolsObserve.getCurrentScreenHandler
  const originalWaitForUIHandler = (ToolsInteract as any).waitForUIHandler

  try {
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: 'fp_home', activity: 'com.example.HomeActivity' })
    let expectScreen = await ToolsInteract.expectScreenHandler({ platform: 'android', fingerprint: 'fp_home' })
    assert.deepStrictEqual(expectScreen, {
      success: true,
      observed_screen: { fingerprint: 'fp_home', screen: 'com.example.HomeActivity' },
      expected_screen: { fingerprint: 'fp_home', screen: null },
      confidence: 1
    })

    ;(Observe as any).ToolsObserve.getCurrentScreenHandler = async () => ({
      activity: 'com.example.HomeActivity',
      shortActivity: 'HomeActivity'
    })
    expectScreen = await ToolsInteract.expectScreenHandler({ platform: 'android', screen: 'HomeActivity' })
    assert.strictEqual(expectScreen.success, true)
    assert.strictEqual(expectScreen.observed_screen.screen, 'HomeActivity')
    assert.strictEqual(expectScreen.confidence, 1)

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

    ;(ToolsInteract as any).waitForUIHandler = async () => ({
      status: 'timeout',
      error: { code: 'ELEMENT_NOT_FOUND', message: 'Condition visible not satisfied within timeout' }
    })
    const timeoutResult = await ToolsInteract.expectElementVisibleHandler({
      selector: { text: 'Missing' },
      platform: 'android'
    })
    assert.deepStrictEqual(timeoutResult, {
      success: false,
      selector: { text: 'Missing' },
      element_id: null,
      failure_code: 'TIMEOUT',
      retryable: true
    })

    console.log('expect_* unit tests passed')
  } finally {
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = originalGetScreenFingerprintHandler
    ;(Observe as any).ToolsObserve.getCurrentScreenHandler = originalGetCurrentScreenHandler
    ;(ToolsInteract as any).waitForUIHandler = originalWaitForUIHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
