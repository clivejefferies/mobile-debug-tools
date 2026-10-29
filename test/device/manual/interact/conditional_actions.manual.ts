// Run against a built checkout and an explicitly selected simulator in system Settings.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

function arg(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined }
async function run() {
  const platform = arg('--platform')
  const deviceId = arg('--id')
  const targetText = arg('--target-text')
  const destinationText = arg('--destination-text')
  const output = arg('--output')
  assert.ok(platform === 'android' || platform === 'ios', '--platform android|ios is required')
  assert.ok(deviceId && targetText && destinationText && output, '--id, --target-text, --destination-text and --output are required')
  const repository = fileURLToPath(new URL('../../../../', import.meta.url))
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(repository, 'dist/server.js')], cwd: repository, stderr: 'pipe' })
  const client = new Client({ name: 'conditional-device-verification', version: '1.0.0' })
  const evidence: any = { platform, deviceId, checked_at: new Date().toISOString(), source: 'built dist/server.js over MCP stdio', scenarios: [] }
  transport.stderr?.on('data', chunk => process.stderr.write(chunk))
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: { platform, deviceId, ...args } }, undefined, { timeout: 120000 })
    const item: any = result.content.find((item: any) => item.type === 'text')
    return JSON.parse(item.text)
  }
  const observe = async () => {
    const result = await call('get_ui_tree', {})
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.ok(result.resolution.width > 0 && result.elements.length > 0, 'nonempty usable hierarchy required')
    return result
  }
  const contains = (tree: any, text: string) => tree.elements.some((element: any) => element.text === text || element.contentDescription === text || element.resourceId === text)
  try {
    await client.connect(transport)
    evidence.server = client.getServerVersion()
    const tools = await client.listTools()
    assert.ok((tools.tools.find(tool => tool.name === 'tap')?.inputSchema.properties as any)?.expectedState, 'newly built server advertises the condition')
    const baseline = await observe()
    assert.ok(contains(baseline, targetText), `starting screen must contain ${targetText}`)
    assert.ok(!contains(baseline, destinationText), 'destination must not already be present on the starting screen')
    const expectedState = { snapshotSessionId: baseline.snapshot_session_id, snapshotRevision: baseline.snapshot_revision, timeoutMs: 30000 }
    const target = baseline.elements.find((element: any) => element.text === targetText)
    assert.ok(target?.bounds, `target ${targetText} needs bounds`)
    const [left, top, right, bottom] = target.bounds
    const matched = await call('tap', { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2), expectedState, verificationMode: 'none', responseMode: 'compact', actionTimeoutMs: 30000 })
    evidence.scenarios.push({ name: 'matching snapshot dispatch', result: matched })
    assert.equal(matched.success, true, JSON.stringify(matched))
    assert.equal(matched.condition.status, 'matched')
    const destination = await observe()
    assert.ok(contains(destination, destinationText), `destination must contain ${destinationText}`)
    evidence.scenarios[0].observed_destination = { snapshot_revision: destination.snapshot_revision, labels: destination.elements.map((e: any) => e.text || e.contentDescription).filter(Boolean) }
    evidence.scenarios[0].status = 'pass'
    const back = destination.elements.find((element: any) => element.contentDescription === 'Navigate up' || element.contentDescription === 'Back' || (element.text === 'Settings' && element.clickable))
    assert.ok(back, 'safe back-navigation target required on destination')
    const [bl, bt, br, bb] = back.bounds
    const selector = back.resourceId ? { resource_id: back.resourceId } :
      back.text ? { text: back.text } : { accessibility_id: back.contentDescription }
    for (const responseMode of ['compact', 'debug']) {
      const mismatch = await call('tap', { x: Math.floor((bl + br) / 2), y: Math.floor((bt + bb) / 2), expectedState, verificationMode: 'none', responseMode, actionTimeoutMs: 30000 })
      evidence.scenarios.push({ name: `mismatch blocks back navigation (${responseMode})`, result: mismatch })
      assert.equal(mismatch.failure_code, 'PRECONDITION_FAILED', JSON.stringify(mismatch))
      assert.equal(mismatch.dispatch_started, false)
      assert.equal(mismatch.delivery_status, 'not_delivered')
      assert.ok(contains(mismatch.condition.observed, destinationText))
      const after = await observe()
      assert.ok(contains(after, destinationText), 'blocked back navigation must leave destination visible')
      evidence.scenarios.at(-1).status = 'pass'
      const journey = await call('run_journey', { responseMode, defaults: { verificationMode: 'none', actionTimeoutMs: 30000 }, steps: [
        { id: 'destination-visible', type: 'wait', selector: { text: destinationText }, condition: 'visible', timeoutMs: 30000 },
        { id: 'conditional-back', type: 'tap', selector, waitFor: { condition: 'visible', timeoutMs: 10000 }, expectedState },
        { id: 'must-not-run', type: 'tap', selector, waitFor: { condition: 'visible', timeoutMs: 10000 } }
      ] })
      evidence.scenarios.push({ name: `conditional journey stops (${responseMode})`, result: journey })
      assert.equal(journey.stopped_at_step_id, 'conditional-back', JSON.stringify(journey))
      assert.equal(journey.steps[0].status, 'passed')
      assert.equal(journey.steps[1].result.failure_code, 'PRECONDITION_FAILED')
      assert.ok(contains(journey.steps[1].result.condition.observed, destinationText))
      assert.equal(journey.steps[2].status, 'not_run')
      assert.ok(contains(await observe(), destinationText))
      evidence.scenarios.at(-1).status = 'pass'
    }
    evidence.status = 'pass'
    console.log(JSON.stringify({ platform, deviceId, server: evidence.server, status: evidence.status, scenarios: evidence.scenarios.map((scenario: any) => ({ name: scenario.name, status: scenario.status })), output }, null, 2))
  } catch (error) {
    evidence.status = 'fail'
    evidence.error = String(error)
    throw error
  } finally {
    await writeFile(output!, JSON.stringify(evidence, null, 2))
    await client.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
