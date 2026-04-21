import assert from 'assert'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsManage } from '../../../src/manage/index.js'
import { AndroidManage } from '../../../src/manage/index.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'

async function run() {
  const originalInstallAppHandler = (ToolsManage as any).installAppHandler
  const originalWaitForUIHandler = (ToolsInteract as any).waitForUIHandler
  const originalTapElementHandler = (ToolsInteract as any).tapElementHandler
  const originalTapHandler = (ToolsInteract as any).tapHandler
  const originalExpectScreenHandler = (ToolsInteract as any).expectScreenHandler
  const originalExpectElementVisibleHandler = (ToolsInteract as any).expectElementVisibleHandler
  const originalStartApp = AndroidManage.prototype.startApp
  const originalCaptureScreenshotHandler = (ToolsObserve as any).captureScreenshotHandler
  const originalGetUITreeHandler = (ToolsObserve as any).getUITreeHandler
  const originalGetScreenFingerprintHandler = (ToolsObserve as any).getScreenFingerprintHandler

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
      action_id: 'tap_element_1',
      timestamp: 1234567890,
      action_type: 'tap_element',
      target: {
        selector: { elementId: 'el_ready' },
        resolved: { elementId: 'el_ready', text: 'Ready', resource_id: null, accessibility_id: null, class: 'Button', bounds: [0, 0, 10, 10], index: 0 }
      },
      success: true,
      ui_fingerprint_before: 'fp_before',
      ui_fingerprint_after: 'fp_after'
    })

    const tapElementResponse = await handleToolCall('tap_element', { elementId: 'el_ready' })
    const tapElementPayload = JSON.parse((tapElementResponse as any).content[0].text)
    assert.strictEqual(tapElementPayload.success, true)
    assert.strictEqual(tapElementPayload.action_type, 'tap_element')
    assert.strictEqual(tapElementPayload.target.resolved.elementId, 'el_ready')
    assert.strictEqual(tapElementPayload.ui_fingerprint_before, 'fp_before')

    ;(ToolsObserve as any).getScreenFingerprintHandler = async () => ({ fingerprint: 'fp_mock', activity: 'MainActivity' })
    ;(ToolsInteract as any).tapHandler = async () => ({ success: true, x: 1, y: 2 })
    const tapResponse = await handleToolCall('tap', { platform: 'android', x: 1, y: 2 })
    const tapPayload = JSON.parse((tapResponse as any).content[0].text)
    assert.strictEqual(tapPayload.success, true)
    assert.strictEqual(tapPayload.action_type, 'tap')
    assert.deepStrictEqual(tapPayload.target.selector, { x: 1, y: 2 })
    assert.strictEqual(tapPayload.ui_fingerprint_before, 'fp_mock')

    AndroidManage.prototype.startApp = async function () {
      return {
        device: { platform: 'android', id: 'emulator-5554', osVersion: '14', model: 'Pixel', simulator: true },
        appStarted: true,
        launchTimeMs: 123
      } as any
    }
    const startAppResponse = await handleToolCall('start_app', { platform: 'android', appId: 'com.example.app' })
    const startAppPayload = JSON.parse((startAppResponse as any).content[0].text)
    assert.strictEqual(startAppPayload.success, true)
    assert.strictEqual(startAppPayload.action_type, 'start_app')
    assert.deepStrictEqual(startAppPayload.target.selector, { appId: 'com.example.app' })

    ;(ToolsInteract as any).expectScreenHandler = async () => ({
      success: true,
      observed_screen: { fingerprint: 'fp_after', screen: 'MainActivity' },
      expected_screen: { fingerprint: 'fp_after', screen: null },
      confidence: 1
    })

    const expectScreenResponse = await handleToolCall('expect_screen', { fingerprint: 'fp_after' })
    const expectScreenPayload = JSON.parse((expectScreenResponse as any).content[0].text)
    assert.strictEqual(expectScreenPayload.success, true)
    assert.strictEqual(expectScreenPayload.confidence, 1)

    ;(ToolsInteract as any).expectElementVisibleHandler = async () => ({
      success: true,
      selector: { text: 'Ready' },
      element_id: 'el_ready',
      element: { elementId: 'el_ready', text: 'Ready', resource_id: null, accessibility_id: null, class: 'TextView', bounds: [0, 0, 10, 10], index: 0 }
    })

    const expectElementResponse = await handleToolCall('expect_element_visible', { selector: { text: 'Ready' } })
    const expectElementPayload = JSON.parse((expectElementResponse as any).content[0].text)
    assert.strictEqual(expectElementPayload.success, true)
    assert.strictEqual(expectElementPayload.element_id, 'el_ready')

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
    ;(ToolsInteract as any).tapHandler = originalTapHandler
    ;(ToolsInteract as any).expectScreenHandler = originalExpectScreenHandler
    ;(ToolsInteract as any).expectElementVisibleHandler = originalExpectElementVisibleHandler
    AndroidManage.prototype.startApp = originalStartApp
    ;(ToolsObserve as any).captureScreenshotHandler = originalCaptureScreenshotHandler
    ;(ToolsObserve as any).getUITreeHandler = originalGetUITreeHandler
    ;(ToolsObserve as any).getScreenFingerprintHandler = originalGetScreenFingerprintHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
