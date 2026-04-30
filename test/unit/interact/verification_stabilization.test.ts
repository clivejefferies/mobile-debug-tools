import assert from 'assert'
import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting verification stabilization unit tests...')

  const originalGetUITreeHandler = (Observe as any).ToolsObserve.getUITreeHandler

  try {
    let visibilityCalls = 0
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => {
      visibilityCalls++
      const visible = visibilityCalls >= 3
      return {
        device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        captured_at_ms: Date.now(),
        resolution: { width: 1080, height: 2400 },
        elements: [
          {
            text: visible ? 'Ready' : 'Loading',
            contentDescription: null,
            type: 'android.widget.TextView',
            resourceId: 'ready_label',
            clickable: false,
            enabled: true,
            visible,
            bounds: [0, 0, 120, 40]
          }
        ]
      }
    }

    const visibleResult = await ToolsInteract.waitForUIHandler({
      selector: { text: 'Ready' },
      condition: 'visible',
      timeout_ms: 600,
      poll_interval_ms: 50,
      platform: 'android'
    })

    assert.strictEqual(visibleResult.status, 'success')
    assert.ok(visibilityCalls >= 4, 'visibility should be confirmed across consecutive reads')

    let stateCalls = 0
    ;(Observe as any).ToolsObserve.getUITreeHandler = async () => {
      stateCalls++
      const value = stateCalls >= 3 ? 30 : 10
      const stale = stateCalls === 2
      return {
        device: { platform: 'android', id: 'mock-device', osVersion: '14', model: 'Pixel', simulator: true },
        captured_at_ms: stale ? Date.now() - 1000 : Date.now(),
        resolution: { width: 1080, height: 2400 },
        elements: [
          {
            text: 'Volume',
            contentDescription: null,
            type: 'android.widget.SeekBar',
            resourceId: 'volume_slider',
            clickable: true,
            enabled: true,
            visible: true,
            bounds: [0, 0, 240, 40],
            state: {
              value,
              raw_value: value,
              value_range: { min: 0, max: 100 }
            }
          }
        ]
      }
    }

    const stateResult = await ToolsInteract.expectStateHandler({
      selector: { text: 'Volume' },
      property: 'value',
      expected: 30,
      platform: 'android'
    })

    assert.strictEqual(stateResult.success, true)
    assert.strictEqual(stateResult.reason, 'value matches expected value')
    assert.ok(stateCalls >= 4, 'state verification should require stable fresh reads')

    console.log('verification stabilization unit tests passed')
  } finally {
    ;(Observe as any).ToolsObserve.getUITreeHandler = originalGetUITreeHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
