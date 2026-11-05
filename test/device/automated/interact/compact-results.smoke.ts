import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'compact-results-smoke', version: '1.0.0' })
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
async function call(name: string, args: Record<string, unknown> = {}) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })
  const item = response.content.find(item => item.type === 'text')
  assert(item?.type === 'text')
  return { value: JSON.parse(item.text), bytes: Buffer.byteLength(item.text) }
}
async function details(value: Record<string, any>) {
  const result = await call('get_interaction_diagnostics', { sessionId: value.diagnostics.session_id, resultId: value.diagnostics.result_id })
  assert.equal(result.value.success, true)
  return result.value.result
}
try {
  await client.connect(transport)
  const discovery = await call('list_devices')
  for (const platform of ['android', 'ios']) {
    const device = discovery.value.devices.find((d: Record<string, any>) => d.platform === platform && d.simulator && (platform === 'android' || d.booted))
    assert(device, `A booted ${platform} simulator/emulator is required`)
    const target = { platform, deviceId: device.id }, appId = platform === 'android' ? 'com.android.settings' : 'com.apple.Preferences'
    const none = await call('start_app', { ...target, appId, verificationMode: 'none', responseMode: 'compact' })
    assert.equal(none.value.success, true)
    assert.equal(none.value.verification.status, 'not_requested')
    assert.equal(none.value.observed_state.status, 'unknown')
    assert.ok(none.bytes <= 1280 + Buffer.byteLength(device.id))
    assert.equal((await details(none.value)).evidence.action_id, none.value.action_id)
    const observed = await call('start_app', { ...target, appId, verificationMode: 'light', verificationTimeoutMs: 30000, responseMode: 'compact' })
    assert.equal(observed.value.success, true)
    assert.equal(observed.value.observed_state.status, 'observed', JSON.stringify(observed.value))
    assert.ok(observed.bytes <= 1280 + Buffer.byteLength(device.id))
    const blocked = await call('tap_element', { ...target, selector: { text: '__mcp_absent_compact_fixture__' }, verificationMode: 'none', responseMode: 'compact', actionTimeoutMs: 1000 })
    assert.equal(blocked.value.success, false)
    assert.equal(blocked.value.dispatch_started, false)
    assert.equal(blocked.value.observed_state.status, 'unknown')
    assert.equal((await details(blocked.value)).success, false)
    const tree = await call('get_ui_tree', target)
    const element = tree.value.elements?.find((e: Record<string, any>) => e.visible && typeof e.text === 'string' && e.text.trim())
    assert(element, 'Settings must expose a visible text target')
    const journey = await call('run_journey', { ...target, defaults: { verificationMode: 'none' }, steps: [
      { id: 'open', type: 'start_app', appId },
      { id: 'observe', type: 'assert', assertion: { kind: 'element_visible', selector: { text: element.text } }, timeoutMs: 15000 }
    ] })
    assert.equal(journey.value.success, true, JSON.stringify(journey.value))
    assert.equal(journey.value.steps[1].result.observed_state.status, 'observed')
    const retainedJourney = await details(journey.value)
    const retainedStep = await details(journey.value.steps[0].result)
    assert.equal(retainedJourney.steps[0].result.evidence.action_id, retainedStep.evidence.action_id)
    assert.ok(retainedStep.evidence.dispatch_completed_at_ms)
    console.log(JSON.stringify({ status: 'PASS', platform, device: device.id, os: device.osVersion, server: client.getServerVersion(),
      bytes: { none: none.bytes, observed: observed.bytes, blocked: blocked.bytes, journey: journey.bytes },
      observed: observed.value.observed_state, journeyAssertion: journey.value.steps[1].result.observed_state,
      checks: ['dispatch-only unknown', 'fresh post-observation', 'no-dispatch failure', 'journey', 'read-only original/child lookup'], cleanup: 'Settings remains foreground; no app data/settings changed' }))
  }
} finally { await client.close() }
