import { ToolsObserve } from '../../../src/observe/index.js'
import assert from 'assert'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import { computeScreenFingerprint } from '../../../src/utils/ui/index.js'
import type { DeviceInfo } from '../../../src/types.js'

async function run() {
  console.log('Starting capture_debug_snapshot unit tests...')

  // Save original ToolsObserve handlers
  const origCaptureHandler = (ToolsObserve as any).captureScreenshotHandler
  const origGetCurrentHandler = (ToolsObserve as any).getCurrentScreenHandler
  const origGetFpHandler = (ToolsObserve as any).getScreenFingerprintHandler
  const origGetTreeHandler = (ToolsObserve as any).getUITreeHandler
  const origReadLogStreamHandler = (ToolsObserve as any).readLogStreamHandler
  const origGetLogsHandler = (ToolsObserve as any).getLogsHandler

  const device: DeviceInfo = { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true }
  let resolutions = 0
  _setDeviceListersForTests({
    listAndroidDevices: async () => { resolutions++; return [device] },
    listIOSDevices: async () => { throw new Error('Android snapshot must not discover iOS devices') }
  })
  const assertTarget = (args: any) => {
    assert.strictEqual(args.platform, 'android')
    assert.strictEqual(args.deviceId, device.id, 'Every component must use the resolved fixture device')
  }

  try {
    // --- Test 1: all components succeed and logs come from stream ---
    ;(ToolsObserve as any).captureScreenshotHandler = async function(args: any) {
      assertTarget(args)
      return { device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true }, screenshot: 'BASE64PNG', resolution: { width: 1080, height: 1920 } }
    }
    const current = { device, package: 'com.example', activity: 'com.example.Main', shortActivity: 'Main' }
    const postTreeActivity = { ...current, activity: 'com.example.After' }
    let activityCalls = 0
    ;(ToolsObserve as any).getCurrentScreenHandler = async function(args: any) {
      assert.strictEqual(args.deviceId, device.id)
      return ++activityCalls === 1 ? current : postTreeActivity
    }
    let independentFingerprints = 0
    ;(ToolsObserve as any).getScreenFingerprintHandler = async function() {
      independentFingerprints++
      return { fingerprint: 'independent' }
    }
    let treeReads = 0
    ;(ToolsObserve as any).getUITreeHandler = async function(args: any) {
      assertTarget(args)
      treeReads++
      return { device, screen: '', resolution: { width: 1080, height: 1920 }, elements: [] }
    }
    ;(ToolsObserve as any).readLogStreamHandler = async function(args: any) {
      assertTarget(args)
      return { entries: [ { timestamp: '2026-03-23T20:00:00.000Z', level: 'ERROR', message: 'Boom' } ], crash_summary: { crash_detected: true } }
    }
    ;(ToolsObserve as any).getLogsHandler = async function(args: any) {
      assertTarget(args)
      return { device: { platform: 'android', id: 'mock' }, logs: [], logCount: 0 }
    }

    const res1: any = await ToolsObserve.captureDebugSnapshotHandler({ platform: 'android', includeLogs: true, logLines: 50, sessionId: 's1' })
    console.log('res1:', JSON.stringify(res1, null, 2))
    const pass1 = res1 && res1.raw && res1.raw.screenshot === 'BASE64PNG' && res1.raw.activity === current.activity && Array.isArray(res1.raw.logs) && res1.raw.logs.length === 1
    assert.ok(pass1, 'captureDebugSnapshot should aggregate successful handler results')
    assert.equal(treeReads, 1)
    assert.equal(independentFingerprints, 0)
    assert.equal(res1.raw.fingerprint, computeScreenFingerprint(res1.raw.ui_tree, postTreeActivity, 'android').fingerprint)
    assert.strictEqual(res1.semantic.screen, 'Main')
    assert.strictEqual(res1.semantic.confidence >= 0.7, true)
    assert.deepStrictEqual(res1.semantic.actions_available, null)
    console.log('Test 1:', pass1 ? 'PASS' : 'FAIL')
    assert.strictEqual(resolutions, 1, 'Resolve one device for the entire snapshot')

    // --- Test 2: screenshot and ui tree fail; logs fallback to getLogs ---
    ;(ToolsObserve as any).captureScreenshotHandler = async function(args: any) { assertTarget(args); throw new Error('screencap failed') }
    ;(ToolsObserve as any).getUITreeHandler = async function(args: any) { assertTarget(args); treeReads++; throw new Error('ACTION_TIMEOUT') }
    ;(ToolsObserve as any).readLogStreamHandler = async function(args: any) { assertTarget(args); return { entries: [] } }
    ;(ToolsObserve as any).getLogsHandler = async function(args: any) { assertTarget(args); return { device: { platform: 'android', id: 'mock' }, logs: ['INFO starting','ERROR crash here'], logCount: 2 } }

    const res2: any = await ToolsObserve.captureDebugSnapshotHandler({ platform: 'android', includeLogs: true, logLines: 10, appId: 'com.example' })
    console.log('res2:', JSON.stringify(res2, null, 2))
    const pass2 = res2 && res2.raw && res2.raw.screenshot_error && res2.raw.ui_tree_error && Array.isArray(res2.raw.logs) && res2.raw.logs.length === 2
    assert.ok(pass2, 'captureDebugSnapshot should surface partial failures and fallback logs')
    assert.equal(res2.raw.ui_tree_error, 'ACTION_TIMEOUT')
    assert.equal(res2.raw.fingerprint_error, 'ACTION_TIMEOUT')
    assert.equal(res2.raw.fingerprint, null)
    assert.equal(treeReads, 2)
    console.log('Test 2:', pass2 ? 'PASS' : 'FAIL')

    // --- Test 3: includeLogs=false should omit logs ---
    ;(ToolsObserve as any).captureScreenshotHandler = async function(args: any) { assertTarget(args); return { device: { platform: 'android', id: 'mock' }, screenshot: null } }
    ;(ToolsObserve as any).getCurrentScreenHandler = async function(args: any) { assert.strictEqual(args.deviceId, device.id); throw new Error('activity unavailable') }
    ;(ToolsObserve as any).getUITreeHandler = async function(args: any) {
      assertTarget(args)
      const revision = ++treeReads
      return { device, screen: '', snapshot_revision: revision, captured_at_ms: 1000 + revision,
        resolution: { width: 1080, height: 1920 }, elements: [{ visible: true, text: `State ${revision}` }] }
    }
    ;(ToolsObserve as any).readLogStreamHandler = async function(args: any) { assertTarget(args); return { entries: [] } }

    const res3: any = await ToolsObserve.captureDebugSnapshotHandler({ platform: 'android', includeLogs: false })
    console.log('res3:', JSON.stringify(res3, null, 2))
    const pass3 = res3 && res3.raw && typeof res3.raw.logs !== 'undefined' && res3.raw.logs.length === 0
    assert.ok(pass3, 'captureDebugSnapshot should return an empty logs array when includeLogs is false')
    assert.equal(res3.raw.activity_error, 'activity unavailable')
    assert.equal(res3.raw.fingerprint, computeScreenFingerprint(res3.raw.ui_tree, null, 'android').fingerprint)
    console.log('Test 3:', pass3 ? 'PASS' : 'FAIL')

    let screenshotCalls = 0
    ;(ToolsObserve as any).captureScreenshotHandler = async function(args: any) { assertTarget(args); screenshotCalls++; return { screenshot: 'unexpected' } }
    const res4: any = await ToolsObserve.captureDebugSnapshotHandler({ includeLogs: false, includeScreenshot: false })
    assert.strictEqual(screenshotCalls, 0, 'includeScreenshot=false must not invoke screenshot capture')
    assert.strictEqual(res4.raw.screenshot, null)
    assert.strictEqual(resolutions, 4, 'Each snapshot resolves its own target once')
    assert.equal(treeReads, 4)
    assert.notEqual(res4.raw.fingerprint, res3.raw.fingerprint)
    assert.equal(res4.raw.snapshot_revision, 4)
    assert.equal(res4.raw.captured_at_ms, 1004)
    assert.equal(independentFingerprints, 0)

    // Discovery failure must not collect from an arbitrary/default device.
    _setDeviceListersForTests({ listAndroidDevices: async () => { throw new Error('fixture discovery unavailable') } })
    await assert.rejects(() => ToolsObserve.captureDebugSnapshotHandler({ platform: 'android' }), /fixture discovery unavailable/)
    assert.strictEqual(screenshotCalls, 0, 'No component capture should run without a resolved target')

    const other: DeviceInfo = { ...device, id: 'other-fixture' }
    _setDeviceListersForTests({ listAndroidDevices: async () => [device, other] })
    ;(ToolsObserve as any).getUITreeHandler = async ({ deviceId }: { deviceId: string }) => ({
      device: deviceId === device.id ? device : other, screen: '',
      resolution: { width: 100, height: 200 }, elements: [{ visible: true, text: deviceId }]
    })
    ;(ToolsObserve as any).getCurrentScreenHandler = async ({ deviceId }: { deviceId: string }) => ({
      activity: 'com.example.Main', device: deviceId === device.id ? device : other
    })
    const [first, second] = await Promise.all([device, other].map(target => ToolsObserve.captureDebugSnapshotHandler({
      platform: 'android', deviceId: target.id, includeLogs: false, includeScreenshot: false
    })))
    assert.equal(first.raw.ui_tree?.device.id, device.id)
    assert.equal(second.raw.ui_tree?.device.id, other.id)
    assert.notEqual(first.raw.fingerprint, second.raw.fingerprint)
    assert.equal(independentFingerprints, 0)

    const ios: DeviceInfo = { ...device, platform: 'ios', id: 'ios-fixture' }
    _setDeviceListersForTests({ listIOSDevices: async () => [ios] })
    ;(ToolsObserve as any).getUITreeHandler = async ({ platform, deviceId }: { platform: string; deviceId: string }) => {
      assert.equal(platform, 'ios')
      assert.equal(deviceId, ios.id)
      return { device: ios, screen: '', resolution: { width: 100, height: 200 }, elements: [] }
    }
    const iosResult = await ToolsObserve.captureDebugSnapshotHandler({ platform: 'ios', deviceId: ios.id, includeLogs: false, includeScreenshot: false })
    assert.equal(iosResult.raw.fingerprint, 'independent')
    assert.equal(independentFingerprints, 1)

  } finally {
    _resetDeviceListersForTests()
    ;(ToolsObserve as any).captureScreenshotHandler = origCaptureHandler
    ;(ToolsObserve as any).getCurrentScreenHandler = origGetCurrentHandler
    ;(ToolsObserve as any).getScreenFingerprintHandler = origGetFpHandler
    ;(ToolsObserve as any).getUITreeHandler = origGetTreeHandler
    ;(ToolsObserve as any).readLogStreamHandler = origReadLogStreamHandler
    ;(ToolsObserve as any).getLogsHandler = origGetLogsHandler
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
