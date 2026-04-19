import assert from 'assert'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsManage } from '../../../src/manage/index.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'

async function run() {
  const originalInstallAppHandler = (ToolsManage as any).installAppHandler
  const originalWaitForUIHandler = (ToolsInteract as any).waitForUIHandler
  const originalTapElementHandler = (ToolsInteract as any).tapElementHandler
  const originalCaptureScreenshotHandler = (ToolsObserve as any).captureScreenshotHandler
  const originalGetUITreeHandler = (ToolsObserve as any).getUITreeHandler

  try {
    ;(ToolsManage as any).installAppHandler = async () => ({
      device: { platform: 'android', id: 'emulator-5554', osVersion: '14', model: 'Pixel', simulator: true },
      installed: true,
      output: 'Success'
    })

    const installResponse = await handleToolCall('install_app', { platform: 'android', projectType: 'native', appPath: '/tmp/app.apk' })
    assert.strictEqual((installResponse as any).content.length, 1)
    const installPayload = JSON.parse((installResponse as any).content[0].text)
    assert.strictEqual(installPayload.installed, true)
    assert.strictEqual(installPayload.output, 'Success')
    assert.strictEqual(installPayload.device.id, 'emulator-5554')

    ;(ToolsInteract as any).waitForUIHandler = async () => ({
      status: 'success',
      matched: 1,
      element: { text: 'Ready', bounds: [0, 0, 10, 10], index: 0, elementId: 'el_ready' },
      metrics: { latency_ms: 12, poll_count: 1, attempts: 1 }
    })

    const waitForUIResponse = await handleToolCall('wait_for_ui', { selector: { text: 'Ready' } })
    const waitForUIPayload = JSON.parse((waitForUIResponse as any).content[0].text)
    assert.strictEqual(waitForUIPayload.status, 'success')
    assert.strictEqual(waitForUIPayload.metrics.poll_count, 1)
    assert.strictEqual(waitForUIPayload.element.text, 'Ready')
    assert.strictEqual(waitForUIPayload.element.elementId, 'el_ready')

    ;(ToolsInteract as any).tapElementHandler = async () => ({
      success: true,
      elementId: 'el_ready',
      action: 'tap'
    })

    const tapElementResponse = await handleToolCall('tap_element', { elementId: 'el_ready' })
    const tapElementPayload = JSON.parse((tapElementResponse as any).content[0].text)
    assert.strictEqual(tapElementPayload.success, true)
    assert.strictEqual(tapElementPayload.elementId, 'el_ready')
    assert.strictEqual(tapElementPayload.action, 'tap')

    ;(ToolsObserve as any).captureScreenshotHandler = async () => ({
      device: { platform: 'ios', id: 'booted', osVersion: '18.0', model: 'Simulator', simulator: true },
      screenshot: Buffer.from('png-data').toString('base64'),
      screenshot_mime: 'image/png',
      resolution: { width: 390, height: 844 }
    })

    const screenshotResponse = await handleToolCall('capture_screenshot', { platform: 'ios' })
    assert.strictEqual((screenshotResponse as any).content.length, 2)
    const screenshotMeta = JSON.parse((screenshotResponse as any).content[0].text)
    assert.strictEqual((screenshotResponse as any).content[1].type, 'image')
    assert.strictEqual((screenshotResponse as any).content[1].mimeType, 'image/png')
    assert.strictEqual(screenshotMeta.result.resolution.width, 390)

    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock', osVersion: '14', model: 'Pixel', simulator: true },
      resolution: { width: 1080, height: 2400 },
      elements: [{ text: 'Login', depth: 0, center: { x: 50, y: 20 } }]
    })

    const uiTreeResponse = await handleToolCall('get_ui_tree', { platform: 'android' })
    const uiTreePayload = JSON.parse((uiTreeResponse as any).content[0].text)
    assert.strictEqual(uiTreePayload.elements.length, 1)
    assert.strictEqual(uiTreePayload.resolution.height, 2400)
    assert.strictEqual(uiTreePayload.elements[0].text, 'Login')

    console.log('server response-shape tests passed')
  } finally {
    ;(ToolsManage as any).installAppHandler = originalInstallAppHandler
    ;(ToolsInteract as any).waitForUIHandler = originalWaitForUIHandler
    ;(ToolsInteract as any).tapElementHandler = originalTapElementHandler
    ;(ToolsObserve as any).captureScreenshotHandler = originalCaptureScreenshotHandler
    ;(ToolsObserve as any).getUITreeHandler = originalGetUITreeHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
