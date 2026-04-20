import assert from 'assert'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsManage } from '../../../src/manage/index.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { ToolsNetwork } from '../../../src/network/index.js'

async function run() {
  const originalInstallAppHandler = (ToolsManage as any).installAppHandler
  const originalWaitForUIHandler = (ToolsInteract as any).waitForUIHandler
  const originalTapElementHandler = (ToolsInteract as any).tapElementHandler
  const originalCaptureScreenshotHandler = (ToolsObserve as any).captureScreenshotHandler
  const originalGetUITreeHandler = (ToolsObserve as any).getUITreeHandler
  const originalGetNetworkActivityHandler = (ToolsNetwork as any).getNetworkActivityHandler
  const originalGetNetworkCaptureStatusHandler = (ToolsNetwork as any).getNetworkCaptureStatusHandler
  const originalStartNetworkCaptureHandler = (ToolsNetwork as any).startNetworkCaptureHandler
  const originalStopNetworkCaptureHandler = (ToolsNetwork as any).stopNetworkCaptureHandler
  const originalGetNetworkCertificateStatusHandler = (ToolsNetwork as any).getNetworkCertificateStatusHandler
  const originalPrepareNetworkCertificateInstallHandler = (ToolsNetwork as any).prepareNetworkCertificateInstallHandler

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

    ;(ToolsNetwork as any).getNetworkActivityHandler = async () => ({
      requests: [
        {
          endpoint: '/v1/login',
          method: 'POST',
          statusCode: 401,
          networkError: null,
          status: 'failure',
          durationMs: 320
        }
      ],
      count: 1
    })

    const networkActivityResponse = await handleToolCall('get_network_activity')
    const networkActivityPayload = JSON.parse((networkActivityResponse as any).content[0].text)
    assert.strictEqual(networkActivityPayload.count, 1)
    assert.strictEqual(networkActivityPayload.requests[0].endpoint, '/v1/login')
    assert.strictEqual(networkActivityPayload.requests[0].status, 'failure')

    ;(ToolsNetwork as any).getNetworkCaptureStatusHandler = async () => ({
      mitmdumpAvailable: true,
      mitmdumpPath: 'mitmdump',
      running: false,
      captureFileConfigured: false,
      captureFile: null,
      logFile: '/tmp/mobile-debug-network-capture.log',
      captureFileExists: false,
      captureFileSizeBytes: 0,
      proxyHost: null,
      proxyPort: null,
      startedAt: null,
      recentTlsFailureHosts: ['api.example.com'],
      issues: ['network capture process is not running']
    })
    ;(ToolsNetwork as any).startNetworkCaptureHandler = async () => ({
      success: true,
      started: true,
      proxyHost: '127.0.0.1',
      proxyPort: 8080,
      captureFile: '/tmp/mobile-debug-network-capture.ndjson',
      mitmdumpPath: 'mitmdump'
    })
    ;(ToolsNetwork as any).stopNetworkCaptureHandler = async () => ({
      success: true,
      stopped: true
    })
    ;(ToolsNetwork as any).getNetworkCertificateStatusHandler = async () => ({
      certificateFileAvailable: true,
      certificateFile: '/Users/test/.mitmproxy/mitmproxy-ca-cert.cer',
      certInstallerAvailable: true,
      lockScreenDisabled: false,
      recentTlsFailureHosts: ['api.example.com'],
      issues: ['recent proxy trust failures detected for: api.example.com']
    })
    ;(ToolsNetwork as any).prepareNetworkCertificateInstallHandler = async () => ({
      success: true,
      launched: true,
      manualStepRequired: true,
      certificateFile: '/Users/test/.mitmproxy/mitmproxy-ca-cert.cer',
      devicePath: '/sdcard/Download/mitmproxy-ca-cert.cer',
      lockScreenConfigured: false,
      message: 'Certificate installer launched.'
    })

    const captureStatusResponse = await handleToolCall('get_network_capture_status')
    const captureStatusPayload = JSON.parse((captureStatusResponse as any).content[0].text)
    assert.strictEqual(captureStatusPayload.mitmdumpAvailable, true)
    assert.strictEqual(captureStatusPayload.running, false)

    const startCaptureResponse = await handleToolCall('start_network_capture', {})
    const startCapturePayload = JSON.parse((startCaptureResponse as any).content[0].text)
    assert.strictEqual(startCapturePayload.started, true)
    assert.strictEqual(startCapturePayload.proxyPort, 8080)

    const stopCaptureResponse = await handleToolCall('stop_network_capture')
    const stopCapturePayload = JSON.parse((stopCaptureResponse as any).content[0].text)
    assert.strictEqual(stopCapturePayload.stopped, true)

    const certificateStatusResponse = await handleToolCall('get_network_certificate_status')
    const certificateStatusPayload = JSON.parse((certificateStatusResponse as any).content[0].text)
    assert.strictEqual(certificateStatusPayload.certificateFileAvailable, true)
    assert.strictEqual(certificateStatusPayload.recentTlsFailureHosts[0], 'api.example.com')

    const prepareCertificateResponse = await handleToolCall('prepare_network_certificate_install', {})
    const prepareCertificatePayload = JSON.parse((prepareCertificateResponse as any).content[0].text)
    assert.strictEqual(prepareCertificatePayload.launched, true)
    assert.strictEqual(prepareCertificatePayload.manualStepRequired, true)

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
    ;(ToolsNetwork as any).getNetworkActivityHandler = originalGetNetworkActivityHandler
    ;(ToolsNetwork as any).getNetworkCaptureStatusHandler = originalGetNetworkCaptureStatusHandler
    ;(ToolsNetwork as any).startNetworkCaptureHandler = originalStartNetworkCaptureHandler
    ;(ToolsNetwork as any).stopNetworkCaptureHandler = originalStopNetworkCaptureHandler
    ;(ToolsNetwork as any).getNetworkCertificateStatusHandler = originalGetNetworkCertificateStatusHandler
    ;(ToolsNetwork as any).prepareNetworkCertificateInstallHandler = originalPrepareNetworkCertificateInstallHandler
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
