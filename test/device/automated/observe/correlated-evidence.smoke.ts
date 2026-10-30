import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Exercises the rebuilt stdio server, not the connected/published MCP instance.
async function run() {
  if (process.env.SKIP_DEVICE_TESTS === '1') {
    console.log('Correlated evidence device smoke: SKIPPED (SKIP_DEVICE_TESTS=1)')
    return
  }
  const client = new Client({ name: 'correlated-evidence-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
  const parse = (response: any) => JSON.parse(response.content.find((item: any) => item.type === 'text').text)
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })
  try {
    await client.connect(transport)
    const discovery = parse(await call('list_devices'))
    for (const platform of ['android', 'ios'] as const) {
      const device = discovery.devices.find((d: any) => d.platform === platform && d.simulator &&
        (platform === 'android' || d.booted === true))
      assert.ok(device, `A running ${platform} emulator/simulator is required`)
      const target = { platform, deviceId: device.id }
      const appId = platform === 'android' ? 'com.android.settings' : 'com.apple.Preferences'
      const action = parse(await call('start_app', { ...target, appId, verificationMode: 'none', responseMode: 'compact' }))
      assert.equal(action.success, true, JSON.stringify(action))
      assert.equal(action.action_id, action.evidence.action_id)
      assert.ok(action.evidence.dispatch_started_at_ms)
      assert.ok(action.evidence.dispatch_completed_at_ms >= action.evidence.dispatch_started_at_ms)
      assert.equal(action.evidence.verification_completed_at_ms, null)
      const actionRef = { sessionId: action.evidence.session_id, actionId: action.evidence.action_id }
      const screenResponse: any = await call('capture_screenshot', { ...target, actionRef })
      const screen = parse(screenResponse)
      assert.equal(screen.evidence.action_id, action.action_id)
      assert.equal(screen.evidence.correlation_id, action.evidence.correlation_id)
      assert.equal(screen.evidence.association, 'explicit')
      assert.ok(screenResponse.content.some((item: any) => item.type === 'image' && item.data.length > 0))
      const screenshot = screen.evidence.observations.find((v: any) => v.kind === 'screenshot')
      assert.equal(screenshot.status, 'captured')
      assert.equal(screenshot.freshness, 'fresh')
      assert.ok(screenshot.capture_started_at_ms >= action.evidence.dispatch_completed_at_ms)
      const logsResponse: any = await call('get_logs', { ...target, appId, limit: 5, actionRef })
      const logs = parse(logsResponse)
      assert.equal(logs.evidence.action_id, action.action_id)
      assert.ok(Array.isArray(JSON.parse(logsResponse.content[1].text).logs))
      const log = logs.evidence.observations.find((v: any) => v.kind === 'logs')
      assert.equal(log.status, 'captured', log.error)
      assert.equal(log.event_time_comparable, false)
      assert.equal(log.freshness, 'unknown')
      const snapshot = parse(await call('capture_debug_snapshot', { ...target, actionRef, includeScreenshot: false, includeLogs: false }))
      assert.equal(snapshot.evidence.action_id, action.action_id)
      assert.equal(snapshot.raw.screenshot, null)
      assert.equal(snapshot.evidence.observations.find((v: any) => v.kind === 'screenshot').status, 'omitted')
      assert.equal(snapshot.evidence.observations.find((v: any) => v.kind === 'logs').status, 'omitted')
      assert.ok(snapshot.evidence.observations.every((v: any) => !v.device || v.device.id === device.id))
      const tree = snapshot.evidence.observations.find((v: any) => v.kind === 'ui_tree')
      assert.equal(tree.status, 'captured', tree.error)
      const unassociated = parse(await call('get_ui_tree', { ...target, responseMode: 'compact', actionRef: { ...actionRef, sessionId: 'previous-process' } }))
      assert.equal(unassociated.evidence.association_reason, 'SESSION_MISMATCH')
      assert.equal(unassociated.evidence.action_id, null)
      console.log(JSON.stringify({ status: 'PASS', server: client.getServerVersion(), platform, device: device.id,
        osVersion: device.osVersion, startingApp: appId, actionId: action.action_id,
        phases: { dispatchStarted: action.evidence.dispatch_started_at_ms, dispatchCompleted: action.evidence.dispatch_completed_at_ms,
          screenshotStarted: screenshot.capture_started_at_ms, screenshotCompleted: screenshot.capture_completed_at_ms },
        screenshot: screenshot.status, logs: log.status, uiTree: tree.status,
        disabledComponents: 'omitted', foreignReference: 'unavailable',
        cleanup: 'No settings, app data or streams changed; Settings remains foreground. No content artifacts saved.' }))
    }
  } finally { await client.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
