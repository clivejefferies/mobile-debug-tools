import assert from 'node:assert/strict'
import { debuggerSessions } from '../../../src/debugger/sessions.js'
import { withDebuggerGuard, checkDebuggerGuard } from '../../../src/debugger/guard.js'
import { handleToolCall } from '../../../src/server-core.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { getAppReadiness } from '../../../src/observe/readiness-service.js'
const originalPause = debuggerSessions.paused
const originalActive = debuggerSessions.hasActiveSessions
const originalTree = ToolsObserve.getUITreeHandler
const originalWait = ToolsInteract.waitForUIHandler
let paused = true
const pause: any = { debug_session_id: 'session', target: { app_id: 'test.app', pid: 10 }, state: 'paused', captured_at_ms: 1000 }
debuggerSessions.paused = device => paused && device === 'fixture' ? pause : null
debuggerSessions.hasActiveSessions = () => true
_setDeviceListersForTests({ listAndroidDevices: async () => [{ id: 'fixture', platform: 'android' } as any] })
const payload = (response: any) => JSON.parse(response.content.find((c: any) => c.type === 'text').text)
try {
  ToolsObserve.getUITreeHandler = async () => { throw new Error('Paused readiness must not acquire a UI tree') }
  const readiness = await getAppReadiness({ platform: 'android', deviceId: 'fixture' })
  assert.equal(readiness.readiness.state, 'debugger_paused')
  const wait = await getAppReadiness({ platform: 'android', deviceId: 'fixture' }, true)
  assert.equal(wait.failure_code, 'DEBUGGER_PAUSED')
  const blocked = payload(await handleToolCall('tap', { platform: 'android', deviceId: 'fixture', x: 1, y: 1 }))
  assert.equal(blocked.delivery_status, 'not_delivered')
  await withDebuggerGuard('android', 'other', async () => checkDebuggerGuard(true))
  await assert.rejects(withDebuggerGuard('android', 'fixture', async () => checkDebuggerGuard()), /DEBUGGER_PAUSED/)
  paused = false
  let calls = 0
  ToolsInteract.waitForUIHandler = async () => { calls++; if (calls === 2) paused = true; return { status: 'success' } as any }
  const journey = payload(await handleToolCall('run_journey', { platform: 'android', deviceId: 'fixture', responseMode: 'compact', steps: [
    { id: 'first', type: 'wait', selector: { text: 'First' } },
    { id: 'second', type: 'wait', selector: { text: 'Second' } },
    { id: 'third', type: 'wait', selector: { text: 'Third' } }
  ] }))
  assert.equal(journey.steps[0].status, 'passed', 'completed steps survive a later pause')
  assert.equal(journey.steps[1].success, false)
  assert.equal(journey.steps[1].result.failure_code, 'DEBUGGER_PAUSED')
  assert.equal(calls, 2, 'no action queued or retried after pause')
  _setDeviceListersForTests({ listAndroidDevices: async () => { throw new Error('resolution unavailable') } })
  const failedResolution = payload(await handleToolCall('tap', { platform: 'android', deviceId: 'fixture', x: 1, y: 1 }))
  assert.equal(failedResolution.error.tool, 'tap')
  assert.match(failedResolution.error.message, /resolution unavailable/, 'resolution errors retain the MCP error envelope')
  console.log('PASS debugger readiness without UI acquisition, device scoping, dispatch guard, mid-journey pause preservation')
} finally {
  debuggerSessions.paused = originalPause; debuggerSessions.hasActiveSessions = originalActive
  ToolsObserve.getUITreeHandler = originalTree; ToolsInteract.waitForUIHandler = originalWait
  _resetDeviceListersForTests()
}
