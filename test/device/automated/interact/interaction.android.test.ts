import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildDebuggerFixture, debuggerAppId } from '../../../fixtures/debugger-app/build.js'

// Reuse the isolated fixture; the device runner executes fixture journeys sequentially.
const deviceId = process.env.MCP_INTERACTION_DEVICE ?? process.env.MCP_DEBUGGER_DEVICE
if (!deviceId) {
  console.log('UNRUN Android interaction fixture: select an emulator with MCP_INTERACTION_DEVICE')
} else {
  const fixture = buildDebuggerFixture()
  const adb = (...args: string[]) => execFileSync(process.env.ADB_PATH || 'adb', ['-s', deviceId, ...args], { encoding: 'utf8', timeout: 30000 })
  const client = new Client({ name: 'interaction-service-smoke', version: '1.0.0' })
  const target = { platform: 'android', deviceId }
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })
    const text = response.content.find(item => item.type === 'text')
    assert(text?.type === 'text')
    return JSON.parse(text.text)
  }
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' }))
    adb('install', '-r', fixture.artifact)
    const started = await call('start_app', { ...target, appId: debuggerAppId, verificationMode: 'none', responseMode: 'compact' })
    assert.equal(started.success, true)
    const waited = await call('wait_for_ui', { ...target, selector: { text: 'Calculate' }, condition: 'clickable', timeout_ms: 20000 })
    assert.equal(waited.status, 'success', JSON.stringify(waited))
    assert.ok(waited.element?.elementId)
    const tapped = await call('tap_element', { ...target, elementId: waited.element.elementId, verificationMode: 'none', actionTimeoutMs: 30000 })
    assert.equal(tapped.success, true, JSON.stringify(tapped))
    const visible = await call('expect_element_visible', { ...target, selector: { text: 'Result 43' }, timeout_ms: 20000 })
    assert.equal(visible.success, true, JSON.stringify(visible))
    const journey = await call('run_journey', { ...target, steps: [
      { id: 'calculate-again', type: 'tap', selector: { text: 'Calculate' }, verificationMode: 'none' },
      { id: 'enabled-result', type: 'assert', timeoutMs: 30000, assertion: { kind: 'state_equals', selector: { text: 'Result 43' }, property: 'enabled', expected: true } },
      { id: 'visible-result', type: 'assert', timeoutMs: 20000, assertion: { kind: 'element_visible', selector: { text: 'Result 43' } } }
    ], defaults: { actionTimeoutMs: 30000 } })
    assert.equal(journey.success, true, JSON.stringify(journey))
    console.log(JSON.stringify({ status: 'PASS', server: client.getServerVersion(), device: deviceId,
      api: adb('shell', 'getprop', 'ro.build.version.sdk').trim(), runtime: process.version,
      journey: 'clickable wait, resolved-handle tap, visible assertion, selector journey and stable enabled-state assertion',
      evidence: 'Result 43 and enabled=true established by fresh hierarchy assertions', cleanup: 'Owned fixture removed in finally; no other app data or device settings changed' }))
  } finally {
    await client.close()
    try { adb('uninstall', debuggerAppId) } finally { await rm(fixture.directory, { recursive: true, force: true }) }
  }
}
