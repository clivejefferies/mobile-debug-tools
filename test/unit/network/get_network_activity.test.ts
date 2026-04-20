import assert from 'assert'
import { ToolsNetwork } from '../../../src/network/index.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting get_network_activity unit tests...')
  const originalGetUITreeHandler = (Observe as any).ToolsObserve.getUITreeHandler
  const originalTapHandler = (ToolsInteract as any).tapHandler

  try {
    ;(ToolsNetwork as any)._resetForTests()

    const unavailable = await ToolsNetwork.getNetworkActivityHandler()
    assert.strictEqual(unavailable.error, 'network_capture_unavailable')

    ;(ToolsNetwork as any)._setCaptureAvailableForTests(true)

    const noAction = await ToolsNetwork.getNetworkActivityHandler()
    assert.deepStrictEqual(noAction, { requests: [], count: 0 })

    ;(ToolsNetwork as any).recordActionSuccess(1000)
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 999, fullUrl: 'https://api.example.com/v1/ignored', method: 'POST', statusCode: 200, networkError: null, durationMs: 90 })
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 1001, fullUrl: 'https://api.example.com/analytics', method: 'POST', statusCode: 202, networkError: null, durationMs: 25 })
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 1002, fullUrl: 'https://api.example.com/v1/login?ts=123', method: 'post', statusCode: 401, networkError: null, durationMs: 320 })
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 1003, fullUrl: 'https://cdn.example.com/assets/logo.png?cache=1', method: 'GET', statusCode: 200, networkError: null, durationMs: 12 })

    const firstRead = await ToolsNetwork.getNetworkActivityHandler()
    assert.strictEqual(firstRead.count, 1)
    assert.deepStrictEqual(firstRead.requests[0], {
      endpoint: '/v1/login',
      method: 'POST',
      statusCode: 401,
      networkError: null,
      status: 'failure',
      durationMs: 320
    })

    const secondRead = await ToolsNetwork.getNetworkActivityHandler()
    assert.deepStrictEqual(secondRead, { requests: [], count: 0 })

    ;(ToolsNetwork as any)._resetForTests()
    ;(ToolsNetwork as any)._setCaptureAvailableForTests(true)
    ;(ToolsNetwork as any).recordActionSuccess(2000)
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 2001, fullUrl: 'https://api.example.com/telemetry', method: 'POST', statusCode: 204, networkError: null, durationMs: 18 })
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 2002, fullUrl: 'https://cdn.example.com/styles/app.css?rev=1', method: 'GET', statusCode: 200, networkError: null, durationMs: 11 })

    const backgroundOnly = await ToolsNetwork.getNetworkActivityHandler()
    assert.strictEqual(backgroundOnly.count, 2)
    assert.strictEqual(backgroundOnly.requests[0].endpoint, '/telemetry')
    assert.strictEqual(backgroundOnly.requests[1].endpoint, '/styles/app.css')

    ;(ToolsNetwork as any)._resetForTests()
    ;(ToolsNetwork as any)._setCaptureAvailableForTests(true)
    ;(ToolsNetwork as any).recordActionSuccess(3000)
    ;(ToolsNetwork as any)._appendCapturedEventForTests({ timestamp: 3001, fullUrl: 'https://api.example.com/v1/login/', method: 'POST', statusCode: null, networkError: 'Timed out after 5s', durationMs: 5000 })

    const networkFailure = await ToolsNetwork.getNetworkActivityHandler()
    assert.deepStrictEqual(networkFailure.requests[0], {
      endpoint: '/v1/login',
      method: 'POST',
      statusCode: null,
      networkError: 'timeout',
      status: 'retryable',
      durationMs: 5000
    })

    ;(ToolsNetwork as any)._resetForTests()
    ;(ToolsNetwork as any)._setCaptureAvailableForTests(true)
    ;(ToolsInteract as any)._resetResolvedUiElementsForTests()
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock-device' },
      elements: [
        { text: 'Submit', resourceId: 'btn_submit', bounds: [0, 0, 20, 20], visible: true, enabled: true, clickable: true }
      ]
    })
    ;(ToolsInteract as any).tapHandler = async () => ({ success: true })

    const waitResult = await ToolsInteract.waitForUIHandler({
      selector: { text: 'Submit' },
      condition: 'exists',
      timeout_ms: 200,
      poll_interval_ms: 50,
      platform: 'android'
    })
    assert.strictEqual(waitResult.status, 'success')
    assert.strictEqual((ToolsNetwork as any)._getStateForTests().lastActionTimestamp, null)

    const tapElementSuccess = await ToolsInteract.tapElementHandler({ elementId: waitResult.element.elementId })
    assert.strictEqual(tapElementSuccess.success, true)
    assert.ok((ToolsNetwork as any)._getStateForTests().lastActionTimestamp !== null)

    ;(ToolsNetwork as any)._resetForTests()
    ;(ToolsInteract as any)._resetResolvedUiElementsForTests()
    const tapElementFailure = await ToolsInteract.tapElementHandler({ elementId: 'el_missing' })
    assert.strictEqual(tapElementFailure.success, false)
    assert.strictEqual((ToolsNetwork as any)._getStateForTests().lastActionTimestamp, null)

    console.log('get_network_activity unit tests passed')
  } finally {
    ;(ToolsNetwork as any)._resetForTests()
    ;(ToolsInteract as any)._resetResolvedUiElementsForTests()
    ;(Observe as any).ToolsObserve.getUITreeHandler = originalGetUITreeHandler
    ;(ToolsInteract as any).tapHandler = originalTapHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
