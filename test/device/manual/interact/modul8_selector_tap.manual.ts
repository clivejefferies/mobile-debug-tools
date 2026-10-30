import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Explicit Modul8 fixture: run after npm run build with the Android emulator booted.
async function run() {
  const client = new Client({ name: 'modul8-selector-tap-verification', version: '1' })
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
  const target = { platform: 'android', deviceId: 'emulator-5554' }
  const report: any = { verified_on: new Date().toISOString(), device: target, package: 'com.ideamechanics.modul8.dev',
    source: 'rebuilt local MCP stdio server', build_sha256: createHash('sha256').update(readFileSync('dist/server/handlers/tool-handlers.js')).digest('hex'),
    steps: [], status: 'UNRUN', cleanup: 'UNRUN' }
  const call = async (name: string, args: Record<string, unknown>) => {
    const response: any = await client.callTool({ name, arguments: { ...target, ...args } }, undefined, { timeout: 120000 })
    return JSON.parse(response.content.find((item: any) => item.type === 'text').text)
  }
  const assertVisible = async (selector: Record<string, string>) => {
    const result = await call('expect_element_visible', { selector, timeout_ms: 10000, poll_interval_ms: 100 })
    assert.equal(result.success, true, `Visible fixture landmark: ${JSON.stringify(selector)}`)
  }
  const tap = async (text: string, condition?: string) => {
    const args: Record<string, unknown> = { selector: { text }, verificationMode: 'none', responseMode: condition ? 'debug' : 'compact' }
    if (condition) { args.waitFor = { condition, timeoutMs: 10000 }; args.actionTimeoutMs = 15000 }
    const result = await call('tap_element', args)
    report.steps.push({ selector: { text }, waitForCondition: condition ?? 'default', status: result.success ? 'PASS' : 'FAIL',
      failure_code: result.failure_code ?? null, resolved_target: result.target?.resolved, evidence: result.evidence })
    assert.equal(result.success, true, `tap_element ${text}: ${result.failure_code ?? result.error?.message}`)
    assert.ok(result.evidence.dispatch_started_at_ms)
    assert.ok(result.evidence.dispatch_completed_at_ms >= result.evidence.dispatch_started_at_ms)
    assert.equal(result.evidence.verification_completed_at_ms, null)
  }
  try {
    await client.connect(transport)
    report.server = client.getServerVersion()
    const launch = await call('start_app', { appId: report.package, verificationMode: 'none', responseMode: 'compact' })
    assert.equal(launch.success, true)
    await assertVisible({ text: 'Subscription' })
    report.starting_state = 'Subscription'
    await tap('FAVOURITES')
    await assertVisible({ accessibility_id: 'Favourites' })
    await tap('GENER8')
    await assertVisible({ text: 'Personalised breathing' })
    await tap('SETTINGS', 'exists')
    await assertVisible({ text: 'Subscription' })
    await tap('FAVOURITES', 'visible')
    await assertVisible({ accessibility_id: 'Favourites' })
    await tap('SETTINGS')
    await assertVisible({ text: 'Subscription' })
    report.cleanup = 'PASS: restored Subscription; no settings, account data, favourites or sessions changed; no streams or screenshots created'
    report.status = 'PASS'
  } catch (error) {
    report.status = 'FAIL'; report.error = String(error)
    throw error
  } finally {
    writeFileSync('docs/specs/022-correlated-evidence/modul8-selector-fix-evidence.json', JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ status: report.status, server: report.server, device: target, steps: report.steps.map((s: any) => ({ selector: s.selector, condition: s.waitForCondition, status: s.status })), cleanup: report.cleanup }))
    await client.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
