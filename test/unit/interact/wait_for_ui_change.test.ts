import assert from 'assert'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'

async function run() {
  const originalGetUITreeHandler = (ToolsObserve as any).getUITreeHandler

  try {
    let calls = 0
    ;(ToolsObserve as any).getUITreeHandler = async () => {
      calls++
      if (calls === 1) {
        return {
          device: { platform: 'android', id: 'mock', osVersion: '14', model: 'Pixel', simulator: true },
          screen: 'Loading',
          resolution: { width: 1080, height: 2400 },
          elements: [{ text: 'Loading', type: 'TextView', bounds: [0, 0, 100, 40], visible: true }],
          snapshot_revision: 1,
          captured_at_ms: 1000
        }
      }

      return {
        device: { platform: 'android', id: 'mock', osVersion: '14', model: 'Pixel', simulator: true },
        screen: 'Loaded',
        resolution: { width: 1080, height: 2400 },
        elements: [{ text: 'Loaded', type: 'TextView', bounds: [0, 0, 100, 40], visible: true }],
        snapshot_revision: 2,
        captured_at_ms: 2000
      }
    }

    const success = await ToolsInteract.waitForUIChangeHandler({
      platform: 'android',
      deviceId: 'mock',
      expected_change: 'text_change',
      timeout_ms: 1500,
      stability_window_ms: 1
    })

    assert.strictEqual(success.success, true)
    assert.strictEqual(success.observed_change, 'text_change')
    assert.strictEqual(success.snapshot_revision, 2)
    assert.strictEqual(success.timeout, false)

    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock', osVersion: '14', model: 'Pixel', simulator: true },
      screen: 'Static',
      resolution: { width: 1080, height: 2400 },
      elements: [{ text: 'Static', type: 'TextView', bounds: [0, 0, 100, 40], visible: true }],
      snapshot_revision: 9,
      captured_at_ms: 3000
    })

    const timeout = await ToolsInteract.waitForUIChangeHandler({
      platform: 'android',
      deviceId: 'mock',
      expected_change: 'state_change',
      timeout_ms: 700,
      stability_window_ms: 1
    })

    assert.strictEqual(timeout.success, false)
    assert.strictEqual(timeout.observed_change, null)
    assert.strictEqual(timeout.timeout, true)

    console.log('wait_for_ui_change tests passed')
  } finally {
    ;(ToolsObserve as any).getUITreeHandler = originalGetUITreeHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
