import assert from 'node:assert/strict'
import { debuggerSessions, iosDebuggerSessions } from '../../../src/debugger/sessions.js'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { markDispatchStarted } from '../../../src/utils/operation-budget.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'

const original = {
  androidPaused: debuggerSessions.paused, androidActive: debuggerSessions.hasActiveSessions,
  iosPaused: iosDebuggerSessions.paused, iosActive: iosDebuggerSessions.hasActiveSessions,
  tree: ToolsObserve.getUITreeHandler, tap: ToolsInteract.tapHandler
}
let iosPaused = false, androidPaused = false, racePause = false, reads = 0, androidResolutions = 0
const inputs: { platform?: string; deviceId?: string }[] = []
const pause: any = { debug_session_id: 'ios-session', target: { app_id: 'test.app', pid: 1 }, state: 'paused', captured_at_ms: 1 }
const tree = (platform: string, id: string): any => ({ device: { platform, id }, resolution: { width: 100, height: 100 },
  elements: [{ text: 'Target', resourceId: 'target', bounds: [0, 0, 40, 40], visible: true, enabled: true, clickable: true }] })
const payload = (response: any) => JSON.parse(response.content.find((item: any) => item.type === 'text').text)
const call = async (elementId: string, hints: Record<string, unknown> = {}) => payload(await handleToolCall('tap_element', {
  elementId, verificationMode: 'none', responseMode: 'compact', ...hints
}))
_setDeviceListersForTests({
  listAndroidDevices: async () => { androidResolutions++; return [{ id: 'android', platform: 'android' } as any] },
  listIOSDevices: async () => ['ios-a', 'ios-b'].map(id => ({ id, platform: 'ios', booted: true } as any))
})
debuggerSessions.hasActiveSessions = () => true
iosDebuggerSessions.hasActiveSessions = () => true
debuggerSessions.paused = id => androidPaused && id === 'android' ? { ...pause, debug_session_id: 'android-session' } : null
iosDebuggerSessions.paused = id => iosPaused && id === 'ios-a' ? pause : null
ToolsInteract._resetResolvedUiElementsForTests()
try {
  ToolsObserve.getUITreeHandler = async ({ platform, deviceId }) => {
    reads++
    if (racePause) iosPaused = true
    return tree(platform!, deviceId!)
  }
  ToolsInteract.tapHandler = async ({ platform, deviceId, x, y }) => {
    markDispatchStarted()
    inputs.push({ platform, deviceId })
    return { success: true, device: { platform, id: deviceId }, x, y } as any
  }
  const handle = async (platform: 'android' | 'ios', deviceId: string) => {
    const result = await ToolsInteract.waitForUIHandler({ platform, deviceId, selector: { text: 'Target' }, condition: 'exists', timeout_ms: 1000 })
    assert.equal(result.status, 'success')
    return result.element.elementId
  }
  const ios = await handle('ios', 'ios-a')
  const otherIOS = await handle('ios', 'ios-b')
  const android = await handle('android', 'android')
  reads = 0; androidResolutions = 0; iosPaused = true
  for (const hints of [{}, { deviceId: 'ios-a' }, { platform: 'ios' }]) {
    const blocked = await call(ios, hints)
    assert.equal(blocked.failure_code, 'DEBUGGER_PAUSED')
    assert.equal(blocked.debugger.debug_session_id, 'ios-session')
    assert.equal(blocked.delivery_status, 'not_delivered'); assert.equal(blocked.dispatch_started, false)
  }
  assert.equal(reads, 0, 'A known pause must block before hierarchy reads')
  assert.equal(inputs.length, 0); assert.equal(androidResolutions, 0, 'An iOS handle must not resolve an Android device')

  iosPaused = false
  assert.equal((await call(ios)).success, true)
  assert.deepEqual(inputs.pop(), { platform: 'ios', deviceId: 'ios-a' })
  racePause = true
  const raced = await call(ios)
  assert.equal(raced.failure_code, 'DEBUGGER_PAUSED')
  assert.equal(raced.delivery_status, 'not_delivered'); assert.equal(inputs.length, 0, 'A pause during target refresh must block native dispatch')
  racePause = false

  assert.equal((await call(android)).success, true, 'An unrelated iOS pause must not block Android')
  assert.deepEqual(inputs.pop(), { platform: 'android', deviceId: 'android' })
  androidPaused = true
  assert.equal((await call(android)).failure_code, 'DEBUGGER_PAUSED')
  assert.equal((await call(otherIOS)).success, true, 'Other iOS devices must remain usable')
  assert.deepEqual(inputs.pop(), { platform: 'ios', deviceId: 'ios-b' })
  androidPaused = false; reads = 0
  for (const hints of [{ platform: 'android', deviceId: 'android' }, { platform: 'ios', deviceId: 'ios-b' }]) {
    assert.equal((await call(ios, hints)).failure_code, 'STALE_REFERENCE', 'Explicit mismatches retain handle validation')
  }
  assert.equal((await call('unknown', { platform: 'ios', deviceId: 'ios-b' })).failure_code, 'STALE_REFERENCE')
  assert.equal(reads, 0); assert.equal(inputs.length, 0)
  console.log('PASS stored-handle debugger guards: omitted target, no observation/input while paused, racing pause, platform/device isolation and mismatches')
} finally {
  debuggerSessions.paused = original.androidPaused; debuggerSessions.hasActiveSessions = original.androidActive
  iosDebuggerSessions.paused = original.iosPaused; iosDebuggerSessions.hasActiveSessions = original.iosActive
  ToolsObserve.getUITreeHandler = original.tree; ToolsInteract.tapHandler = original.tap
  ToolsInteract._resetResolvedUiElementsForTests(); _resetDeviceListersForTests()
}
