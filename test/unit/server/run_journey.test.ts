import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import assert from 'assert'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'

async function run() {
  const originalWait = (ToolsInteract as any).waitForUIHandler
  const originalExpectVisible = (ToolsInteract as any).expectElementVisibleHandler
  const originalTap = (ToolsInteract as any).tapElementHandler
  const originalTree = (ToolsObserve as any).getUITreeHandler
  let resolutions = 0
  _setDeviceListersForTests({ listAndroidDevices: async () => { resolutions++; return [{ id: 'fixture', platform: 'android' } as any] } })
  try {
    const calls: string[] = []
    ;(ToolsInteract as any).waitForUIHandler = async () => {
      calls.push('wait')
      return { status: 'success', element: { elementId: 'ready' } }
    }
    ;(ToolsInteract as any).expectElementVisibleHandler = async () => {
      calls.push('assert')
      return { success: false, failure_code: 'TIMEOUT' }
    }

    const response: any = await handleToolCall('run_journey', {
      platform: 'android',
      steps: [
        { id: 'wait-ready', type: 'wait', selector: { text: 'Ready' } },
        { id: 'assert-ready', type: 'assert', assertion: { kind: 'element_visible', selector: { text: 'Ready' } } },
        { id: 'not-run', type: 'wait', selector: { text: 'Later' } }
      ]
    })
    const result = JSON.parse(response.content[0].text)
    assert.strictEqual(resolutions, 1)
    assert.deepStrictEqual(calls, ['wait', 'assert'])
    await handleToolCall('run_journey', { platform: 'android', steps: [{ id: 'valid', type: 'wait', selector: { text: 'Ready' } }, { id: 'bad', type: 'tap' }] })
    assert.strictEqual(resolutions, 1, 'Invalid later steps must fail before device work')
    assert.deepStrictEqual(calls, ['wait', 'assert'])
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.stopped_at_step_id, 'assert-ready')
    assert.strictEqual(result.steps[0].status, 'passed')
    assert.strictEqual(result.steps[1].status, 'failed')
    assert.deepStrictEqual(result.steps[2], {
      id: 'not-run', type: 'wait', status: 'not_run', success: false,
      reason: 'PREVIOUS_STEP_FAILED', result: null, timing: { total_ms: 0 }
    })

    let postActionReads = 0
    ;(ToolsObserve as any).getUITreeHandler = async () => { postActionReads++; throw new Error('Unexpected duplicate observation') }
    ;(ToolsInteract as any).waitForUIHandler = async () => ({ status: 'success', element: { elementId: 'target' }, _tree: {} })
    ;(ToolsInteract as any).tapElementHandler = async (args: any) => {
      assert.strictEqual(args.verificationMode, 'none')
      return { success: true, action_id: 'tap', action_type: 'tap_element' }
    }
    ;(ToolsInteract as any).expectElementVisibleHandler = async () => ({ success: true, observed: { matched_count: 1 } })
    const lightResponse: any = await handleToolCall('run_journey', {
      platform: 'android', responseMode: 'compact', defaults: { verificationMode: 'light' },
      steps: [
        { id: 'tap-target', type: 'tap', selector: { accessibility_id: 'target' } },
        { id: 'assert-result', type: 'assert', assertion: { kind: 'element_visible', selector: { accessibility_id: 'result' } } }
      ]
    })
    const light = JSON.parse(lightResponse.content[0].text)
    assert.strictEqual(light.success, true)
    assert.deepStrictEqual(Object.keys(light.timing), ['total_ms'])
    assert.deepStrictEqual(light.steps[0].result.verification, { mode: 'light', status: 'observed' })
    assert.strictEqual(light.steps[0].result.verification_diagnostic, undefined)
    assert.strictEqual(postActionReads, 0, 'The following assertion supplies the fresh observation')
    ;(ToolsInteract as any).expectElementVisibleHandler = async () => ({ success: false, failure_code: 'TIMEOUT', observed: { matched_count: 0 } })
    const failedAssertionResponse: any = await handleToolCall('run_journey', {
      platform: 'android', responseMode: 'compact', defaults: { verificationMode: 'light' },
      steps: [
        { id: 'tap-target', type: 'tap', selector: { accessibility_id: 'target' } },
        { id: 'assert-result', type: 'assert', assertion: { kind: 'element_visible', selector: { accessibility_id: 'result' } } }
      ]
    })
    const failedAssertion = JSON.parse(failedAssertionResponse.content[0].text)
    assert.strictEqual(failedAssertion.success, false)
    assert.deepStrictEqual(failedAssertion.steps[0].result.verification, { mode: 'light', status: 'observed' })
    assert.strictEqual(postActionReads, 0)

    ;(ToolsInteract as any).waitForUIHandler = originalWait
    ;(ToolsInteract as any).expectElementVisibleHandler = originalExpectVisible
    let dispatchedAt = 0
    const readTimes: number[] = []
    ;(ToolsObserve as any).getUITreeHandler = async () => {
      readTimes.push(performance.now())
      const target = readTimes.length === 1
      return {
        device: { platform: 'android', id: 'fixture' },
        captured_at_ms: Date.now(),
        elements: [{ contentDescription: target ? 'target' : 'result', bounds: [0, 0, 20, 20], visible: true, enabled: true, clickable: true }]
      }
    }
    ;(ToolsInteract as any).tapElementHandler = async () => {
      dispatchedAt = performance.now()
      return { success: true, action_id: 'tap', action_type: 'tap_element' }
    }
    const freshResponse: any = await handleToolCall('run_journey', {
      platform: 'android', responseMode: 'compact', defaults: { verificationMode: 'light' },
      steps: [
        { id: 'tap-target', type: 'tap', selector: { accessibility_id: 'target' } },
        { id: 'assert-result', type: 'assert', assertion: { kind: 'element_visible', selector: { accessibility_id: 'result' } } }
      ]
    })
    const fresh = JSON.parse(freshResponse.content[0].text)
    assert.strictEqual(fresh.success, true)
    assert.strictEqual(readTimes.length, 3, 'target selection and two stability samples require separate reads')
    assert.ok(readTimes[0] < dispatchedAt)
    assert.ok(readTimes[1] >= dispatchedAt && readTimes[2] >= dispatchedAt, 'assertion reads must follow dispatch')
  } finally {
    _resetDeviceListersForTests()
    ;(ToolsInteract as any).waitForUIHandler = originalWait
    ;(ToolsInteract as any).expectElementVisibleHandler = originalExpectVisible
    ;(ToolsInteract as any).tapElementHandler = originalTap
    ;(ToolsObserve as any).getUITreeHandler = originalTree
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
