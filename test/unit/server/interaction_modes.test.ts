import assert from 'node:assert/strict'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { AndroidManage } from '../../../src/manage/android.js'
import { markDispatchStarted } from '../../../src/utils/operation-budget.js'

async function run() {
  const treeOriginal = ToolsObserve.getUITreeHandler
  const fingerprintOriginal = ToolsObserve.getScreenFingerprintHandler
  const tapOriginal = ToolsInteract.tapHandler
  const launchOriginal = AndroidManage.prototype.startApp
  const device: any = { platform: 'android', id: 'fixture' }
  let dispatched = false
  let postReads = 0
  let fingerprints = 0
  ToolsObserve.getUITreeHandler = async () => {
    if (dispatched) postReads++
    return { device, elements: [{ text: 'Go', stable_id: 'go', bounds: [0, 0, 40, 40], visible: true, enabled: true, clickable: true }] } as any
  }
  ToolsObserve.getScreenFingerprintHandler = async () => { fingerprints++; return { fingerprint: 'fixture' } as any }
  ToolsInteract.tapHandler = async () => { dispatched = true; return { success: true, device } as any }
  AndroidManage.prototype.startApp = async () => { dispatched = true; return { appStarted: true, device } as any }
  try {
    for (const tool of ['tap_element', 'start_app']) {
      for (const mode of ['none', 'light', 'full']) {
        dispatched = false; postReads = 0; fingerprints = 0
        const response = await handleToolCall(tool, { platform: 'android', deviceId: 'fixture', ...(tool === 'tap_element' ? { selector: { text: 'Go' } } : { appId: 'fixture' }), verificationMode: mode, responseMode: 'compact' })
        const result = JSON.parse(response.content[0].text!)
        assert.equal(result.success, true, JSON.stringify(result))
        assert.equal(postReads, mode === 'light' ? 1 : 0)
        assert.equal(fingerprints, mode === 'full' ? 2 : 0)
        assert.equal(result.device, undefined)
        assert.equal(result.trace, undefined)
        assert.equal(result.dispatch_started, true)
        assert.deepEqual(Object.keys(result.timing), ['total_ms'])
        if (mode !== 'full') assert.equal(result.lifecycle_state, 'pending_verification')
      }
    }
    ToolsObserve.getUITreeHandler = async () => { throw new Error('offline') }
    const result = JSON.parse((await handleToolCall('start_app', { platform: 'android', appId: 'fixture', verificationMode: 'light', responseMode: 'compact' })).content[0].text!)
    assert.equal(result.success, true)
    assert.equal(result.verification.status, 'unavailable')
    assert.equal(result.verification_diagnostic.retryable, true)
    ToolsInteract.tapHandler = async () => { markDispatchStarted(); dispatched = true; return { success: false, error: 'ACTION_TIMEOUT', device } as any }
    const timedOut = JSON.parse((await handleToolCall('tap', { platform: 'android', deviceId: 'fixture', x: 1, y: 1, verificationMode: 'none', responseMode: 'compact' })).content[0].text!)
    assert.equal(timedOut.failure_code, 'ACTION_TIMEOUT')
    assert.equal(timedOut.delivery_status, 'unknown')
    assert.equal(timedOut.retryable, false)
    AndroidManage.prototype.startApp = async () => ({ appStarted: false, device, error: 'launch failed', diagnostics: { runResult: { exitCode: 1, stdout: '', stderr: 'launch failed' } } } as any)
    const failedLaunch = JSON.parse((await handleToolCall('start_app', { platform: 'android', appId: 'fixture' })).content[0].text!)
    assert.equal(failedLaunch.details.diagnostics.runResult.exitCode, 1)
  } finally {
    ToolsObserve.getUITreeHandler = treeOriginal
    ToolsObserve.getScreenFingerprintHandler = fingerprintOriginal
    ToolsInteract.tapHandler = tapOriginal
    AndroidManage.prototype.startApp = launchOriginal
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
