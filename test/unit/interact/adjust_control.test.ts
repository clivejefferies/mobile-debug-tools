import assert from 'assert'
import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting adjust_control unit tests...')

    const originalGetUITreeHandler = (Observe as any).ToolsObserve.getUITreeHandler
    const originalGetScreenFingerprintHandler = (Observe as any).ToolsObserve.getScreenFingerprintHandler
    const originalTapHandler = (ToolsInteract as any).tapHandler
    const originalSwipeHandler = (ToolsInteract as any).swipeHandler
    const originalExpectStateHandler = (ToolsInteract as any).expectStateHandler

  try {
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
      screen: '',
      resolution: { width: 1080, height: 2400 },
      elements: [
        {
          text: 'Duration',
          type: 'android.widget.SeekBar',
          contentDescription: null,
          clickable: true,
          enabled: true,
          visible: true,
          bounds: [0, 0, 200, 40],
          resourceId: 'seek_duration',
          state: {
            value: 10,
            raw_value: 10,
            value_range: { min: 0, max: 100 }
          }
        }
      ]
    })

    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: 'fp_slider', activity: 'MainActivity' })

    const wait = await ToolsInteract.waitForUIHandler({
      selector: { text: 'Duration' },
      condition: 'clickable',
      timeout_ms: 200,
      poll_interval_ms: 50,
      platform: 'android'
    })
    assert.strictEqual(wait.status, 'success')
    assert.ok(wait.element?.elementId)

    const tapCalls: Array<{ platform?: string, x: number, y: number, deviceId?: string }> = []
    const swipeCalls: Array<{ platform?: string, x1: number, y1: number, x2: number, y2: number, duration: number, deviceId?: string }> = []
    ;(ToolsInteract as any).tapHandler = async ({ platform, x, y, deviceId }: any) => {
      tapCalls.push({ platform, x, y, deviceId })
      return {
        device: { platform: platform || 'android', id: deviceId || 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        success: true,
        x,
        y
      }
    }
    ;(ToolsInteract as any).swipeHandler = async ({ platform, x1, y1, x2, y2, duration, deviceId }: any) => {
      swipeCalls.push({ platform, x1, y1, x2, y2, duration, deviceId })
      return {
        device: { platform: platform || 'android', id: deviceId || 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        success: true,
        start: [x1, y1],
        end: [x2, y2],
        duration
      }
    }

    ;(ToolsInteract as any).expectStateHandler = async () => ({
      success: true,
      selector: { text: 'Duration' },
      element_id: wait.element.elementId,
      expected_state: { property: 'value', expected: 30 },
      element: {
        elementId: wait.element.elementId,
        text: 'Duration',
        resource_id: 'seek_duration',
        accessibility_id: null,
        class: 'android.widget.SeekBar',
        bounds: [0, 0, 200, 40],
        index: 0,
        state: { value: 30, raw_value: 30, value_range: { min: 0, max: 100 } }
      },
      observed_state: { property: 'value', value: 30, raw_value: 30 },
      reason: 'value matches expected value'
    })

    const adjust = await ToolsInteract.adjustControlHandler({
      element_id: wait.element.elementId,
      property: 'value',
      targetValue: 30,
      tolerance: 0.5,
      maxAttempts: 2,
      platform: 'android'
    })

    assert.strictEqual(adjust.success, true)
    assert.strictEqual(adjust.converged, true)
    assert.strictEqual(adjust.within_tolerance, true)
    assert.strictEqual(adjust.adjustment_mode, 'coordinate')
    assert.strictEqual(adjust.target_state.target_value, 30)
    assert.strictEqual(adjust.attempts, 1)
    assert.strictEqual(tapCalls.length, 1)
    assert.strictEqual(swipeCalls.length, 0)
    assert.ok(tapCalls[0].x <= 66, 'tap should bias inward from the exact target point')
    assert.strictEqual(adjust.action_type, 'adjust_control')
    assert.strictEqual(adjust.target.selector.elementId, wait.element.elementId)

    ;(ToolsInteract as any).expectStateHandler = async () => ({
      success: true,
      selector: { text: 'Duration' },
      element_id: wait.element.elementId,
      expected_state: { property: 'value', expected: 2 },
      element: {
        elementId: wait.element.elementId,
        text: 'Duration',
        resource_id: 'seek_duration',
        accessibility_id: null,
        class: 'android.widget.SeekBar',
        bounds: [0, 0, 200, 40],
        index: 0,
        state: { value: 2, raw_value: 2, value_range: { min: 0, max: 100 } }
      },
      observed_state: { property: 'value', value: 2, raw_value: 2 },
      reason: 'value matches expected value'
    })

    const lowEndAdjust = await ToolsInteract.adjustControlHandler({
      element_id: wait.element.elementId,
      property: 'value',
      targetValue: 2,
      tolerance: 0.5,
      maxAttempts: 2,
      platform: 'android'
    })

    assert.strictEqual(lowEndAdjust.success, true)
    assert.strictEqual(lowEndAdjust.converged, true)
    assert.strictEqual(lowEndAdjust.within_tolerance, true)
    assert.strictEqual(lowEndAdjust.attempts, 1)
    assert.strictEqual(tapCalls.length, 2)
    assert.strictEqual(swipeCalls.length, 0)
    assert.ok(tapCalls[1].x >= 22, 'low-end tap should stay inside the first step instead of hugging the edge')

    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
      screen: '',
      resolution: { width: 1080, height: 2400 },
      elements: [
        {
          text: 'Duration',
          type: 'android.widget.SeekBar',
          contentDescription: null,
          clickable: true,
          enabled: true,
          visible: true,
          bounds: [0, 0, 200, 40],
          resourceId: 'seek_duration',
          state: {
            value: 18,
            raw_value: 18,
            value_range: { min: 0, max: 20 }
          }
        }
      ]
    })

    ;(ToolsInteract as any).expectStateHandler = async () => ({
      success: true,
      selector: { text: 'Duration' },
      element_id: wait.element.elementId,
      expected_state: { property: 'value', expected: 20 },
      element: {
        elementId: wait.element.elementId,
        text: 'Duration',
        resource_id: 'seek_duration',
        accessibility_id: null,
        class: 'android.widget.SeekBar',
        bounds: [0, 0, 200, 40],
        index: 0,
        state: { value: 20, raw_value: 20, value_range: { min: 0, max: 20 } }
      },
      observed_state: { property: 'value', value: 20, raw_value: 20 },
      reason: 'value matches expected value'
    })

    const highEndAdjust = await ToolsInteract.adjustControlHandler({
      element_id: wait.element.elementId,
      property: 'value',
      targetValue: 20,
      tolerance: 0.5,
      maxAttempts: 2,
      platform: 'android'
    })

    assert.strictEqual(highEndAdjust.success, true)
    assert.strictEqual(highEndAdjust.converged, true)
    assert.strictEqual(highEndAdjust.within_tolerance, true)
    assert.strictEqual(highEndAdjust.attempts, 1)
    assert.strictEqual(tapCalls.length, 3)
    assert.strictEqual(swipeCalls.length, 0)
    assert.ok(tapCalls[2].x >= 180, 'high-end tap should bias into the last step without hitting the edge')

    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
      screen: '',
      resolution: { width: 1440, height: 3200 },
      elements: [
        {
          text: 'Precision',
          type: 'android.widget.SeekBar',
          contentDescription: null,
          clickable: true,
          enabled: true,
          visible: true,
          bounds: [0, 0, 3000, 40],
          resourceId: 'seek_precision',
          state: {
            value: 9000,
            raw_value: 9000,
            value_range: { min: 0, max: 10000 }
          }
        }
      ]
    })

    ;(ToolsInteract as any).expectStateHandler = async () => ({
      success: true,
      selector: { text: 'Precision' },
      element_id: wait.element.elementId,
      expected_state: { property: 'value', expected: 9999 },
      element: {
        elementId: wait.element.elementId,
        text: 'Precision',
        resource_id: 'seek_precision',
        accessibility_id: null,
        class: 'android.widget.SeekBar',
        bounds: [0, 0, 3000, 40],
        index: 0,
        state: { value: 9999, raw_value: 9999, value_range: { min: 0, max: 10000 } }
      },
      observed_state: { property: 'value', value: 9999, raw_value: 9999 },
      reason: 'value matches expected value'
    })

    const precisionAdjust = await ToolsInteract.adjustControlHandler({
      selector: { text: 'Precision' },
      property: 'value',
      targetValue: 9999,
      tolerance: 0.5,
      maxAttempts: 2,
      platform: 'android'
    })

    assert.strictEqual(precisionAdjust.success, true)
    assert.strictEqual(precisionAdjust.converged, true)
    assert.strictEqual(precisionAdjust.within_tolerance, true)
    assert.strictEqual(precisionAdjust.attempts, 1)
    assert.strictEqual(tapCalls.length, 4)
    assert.strictEqual(swipeCalls.length, 0)
    assert.ok(tapCalls[3].x > 2750, 'wide, high-range control should not be clamped to a 3% endpoint margin')

    let treeFetches = 0
    let retryVerificationCount = 0
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => {
      treeFetches++
      return {
        device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        screen: '',
        resolution: { width: 1080, height: 2400 },
        elements: [
          {
            text: 'Duration',
            type: 'android.widget.SeekBar',
            contentDescription: null,
            clickable: true,
            enabled: true,
            visible: true,
            bounds: [0, 0, 200, 40],
            resourceId: 'seek_duration',
            state: {
              value: 10,
              raw_value: 10,
              value_range: { min: 0, max: 20 }
            }
          }
        ]
      }
    }

    ;(ToolsInteract as any).tapHandler = async ({ platform, x, y, deviceId }: any) => {
      tapCalls.push({ platform, x, y, deviceId })
      return {
        device: { platform: platform || 'android', id: deviceId || 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        success: false,
        error: 'tap failed'
      }
    }

    ;(ToolsInteract as any).swipeHandler = async ({ platform, x1, y1, x2, y2, duration, deviceId }: any) => {
      swipeCalls.push({ platform, x1, y1, x2, y2, duration, deviceId })
      return {
        device: { platform: platform || 'android', id: deviceId || 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        success: true,
        start: [x1, y1],
        end: [x2, y2],
        duration
      }
    }

    ;(ToolsInteract as any).expectStateHandler = async () => {
      retryVerificationCount++
      const value = retryVerificationCount === 1 ? 11 : 12
      return {
        success: true,
        selector: { text: 'Duration' },
        element_id: wait.element.elementId,
        expected_state: { property: 'value', expected: 12 },
        element: {
          elementId: wait.element.elementId,
          text: 'Duration',
          resource_id: 'seek_duration',
          accessibility_id: null,
          class: 'android.widget.SeekBar',
          bounds: [0, 0, 200, 40],
          index: 0,
          state: { value, raw_value: value, value_range: { min: 0, max: 20 } }
        },
        observed_state: { property: 'value', value, raw_value: value },
        reason: value === 12 ? 'value matches expected value' : 'value still below target'
      }
    }

    const cachedResolveAdjust = await ToolsInteract.adjustControlHandler({
      element_id: wait.element.elementId,
      property: 'value',
      targetValue: 12,
      tolerance: 0.5,
      maxAttempts: 2,
      platform: 'android'
    })

    assert.strictEqual(cachedResolveAdjust.success, true)
    assert.strictEqual(cachedResolveAdjust.converged, true)
    assert.strictEqual(cachedResolveAdjust.within_tolerance, true)
    assert.ok(cachedResolveAdjust.attempts >= 3)
    assert.strictEqual(treeFetches, 1, 'second attempt should reuse the resolved element instead of refetching the UI tree')

    const probeTapStart = tapCalls.length
    const probeSwipeStart = swipeCalls.length
    let probeVerificationCount = 0
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
      screen: '',
      resolution: { width: 1080, height: 2400 },
      elements: [
        {
          text: 'Duration',
          type: 'android.widget.SeekBar',
          contentDescription: null,
          clickable: true,
          enabled: true,
          visible: true,
          bounds: [0, 0, 200, 40],
          resourceId: 'seek_duration',
          state: {
            value: 10,
            raw_value: 10,
            value_range: { min: 0, max: 20 }
          }
        }
      ]
    })

    ;(ToolsInteract as any).tapHandler = async ({ platform, x, y, deviceId }: any) => {
      tapCalls.push({ platform, x, y, deviceId })
      return {
        device: { platform: platform || 'android', id: deviceId || 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        success: true,
        x,
        y
      }
    }

    ;(ToolsInteract as any).expectStateHandler = async () => {
      probeVerificationCount++
      const value = probeVerificationCount === 1 ? 11 : 12
      return {
        success: true,
        selector: { text: 'Duration' },
        element_id: wait.element.elementId,
        expected_state: { property: 'value', expected: 12 },
        element: {
          elementId: wait.element.elementId,
          text: 'Duration',
          resource_id: 'seek_duration',
          accessibility_id: null,
          class: 'android.widget.SeekBar',
          bounds: [0, 0, 200, 40],
          index: 0,
          state: { value, raw_value: value, value_range: { min: 0, max: 20 } }
        },
        observed_state: { property: 'value', value, raw_value: value },
        reason: value === 12 ? 'value matches expected value' : 'value still below target'
      }
    }

    const probeAdjust = await ToolsInteract.adjustControlHandler({
      element_id: wait.element.elementId,
      property: 'value',
      targetValue: 12,
      tolerance: 0.5,
      maxAttempts: 3,
      platform: 'android'
    })

    assert.strictEqual(probeAdjust.success, true)
    assert.strictEqual(probeAdjust.converged, true)
    assert.strictEqual(probeAdjust.within_tolerance, true)
    assert.strictEqual(probeAdjust.adjustment_mode, 'coordinate')
    assert.strictEqual(probeAdjust.attempts, 2)
    assert.strictEqual(tapCalls.length, probeTapStart + 2)
    assert.strictEqual(swipeCalls.length, probeSwipeStart)

    console.log('adjust_control unit tests passed')
  } finally {
    ;(Observe as any).ToolsObserve.getUITreeHandler = originalGetUITreeHandler
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = originalGetScreenFingerprintHandler
    ;(ToolsInteract as any).tapHandler = originalTapHandler
    ;(ToolsInteract as any).swipeHandler = originalSwipeHandler
    ;(ToolsInteract as any).expectStateHandler = originalExpectStateHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
