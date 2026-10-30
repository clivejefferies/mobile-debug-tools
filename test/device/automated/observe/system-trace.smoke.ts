import { execCmd } from '../../../../src/utils/exec.js'
import { getAdbCmd } from '../../../../src/utils/android/utils.js'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { inspectPerfetto } from '../../../helpers/perfetto.js'

async function run() {
  if (process.env.SKIP_DEVICE_TESTS === '1') { console.log('System trace smoke: SKIPPED (SKIP_DEVICE_TESTS=1)'); return }
  const client = new Client({ name: 'system-trace-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
  const parse = (r: any) => JSON.parse(r.content[0].text)
  const call = async (name: string, args: Record<string, unknown>) => parse(await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 }))
  const owned: string[] = [], artifacts: string[] = []
  try {
    await client.connect(transport)
    const devices = await call('list_devices', {})
    const device = devices.devices.find((d: any) => d.platform === 'android' && d.simulator)
    assert.ok(device, 'A running Android emulator is required')
    const target = { platform: 'android', deviceId: device.id }
    const cap = await call('get_system_trace_capabilities', target)
    assert.equal(cap.supported, true, JSON.stringify(cap))
    const fixtureLaunch = await call('start_app', { ...target, appId: 'com.android.settings', verificationMode: 'none', responseMode: 'compact' })
    assert.equal(fixtureLaunch.success, true)
    const baseline = await call('get_ui_tree', { ...target, responseMode: 'debug' })
    const settingsNode = baseline.elements?.find((e: any) => e.visible && e.resourceId?.startsWith('com.android.settings:id/'))
    assert.ok(settingsNode, 'Fresh baseline must contain a visible Settings-owned UI resource')
    const settingsSelector = { resource_id: settingsNode.resourceId }
    const start = await call('start_system_trace', { ...target, durationMs: 30000 })
    owned.push(start.trace_id)
    assert.equal(start.state, 'recording', JSON.stringify(start))
    const journey = await call('run_journey', { ...target, systemTraceId: start.trace_id,
      steps: [
        { id: 'settings', type: 'start_app', appId: 'com.android.settings', verificationMode: 'none' },
        { id: 'settings-visible', type: 'assert', timeoutMs: 10000, assertion: { kind: 'element_visible', selector: settingsSelector } }
      ] })
    assert.equal(journey.success, true, JSON.stringify(journey))
    assert.equal(journey.steps[1].status, 'passed', 'The baseline Settings-owned UI element must remain semantically visible')
    assert.equal(journey.evidence.trace_context.trace_id, start.trace_id)
    assert.equal(journey.steps[0].result.evidence.trace_context.trace_id, start.trace_id)
    assert.equal(journey.system_trace.coverage, 'covered')
    const stop = await call('stop_system_trace', { traceId: start.trace_id })
    if (stop.artifact) artifacts.push(stop.artifact.path)
    assert.equal(stop.state, 'completed', JSON.stringify(stop)); assert.equal(stop.cleanup.status, 'complete')
    assert.deepEqual(stop.correlation_ids, [journey.evidence.correlation_id])
    const content = inspectPerfetto(await fs.readFile(stop.artifact.path), 30000)
    assert.equal((await call('stop_system_trace', { traceId: start.trace_id })).artifact.path, stop.artifact.path)
    const rejected = await call('run_journey', { ...target, systemTraceId: start.trace_id,
      steps: [{ id: 'must-not-launch', type: 'start_app', appId: 'com.invalid.trace.smoke' }] })
    assert.equal(rejected.error.code, 'TRACE_NOT_FOUND')
    const cancel = await call('start_system_trace', { ...target, durationMs: 30000 })
    owned.push(cancel.trace_id)
    const cancelled = await call('cancel_system_trace', { traceId: cancel.trace_id })
    assert.equal(cancelled.state, 'cancelled', JSON.stringify(cancelled))
    assert.equal((await call('get_system_trace_status', { traceId: cancel.trace_id })).artifact, null)
    const short = await call('start_system_trace', { ...target, durationMs: 1001 })
    owned.push(short.trace_id)
    assert.equal(short.state, 'recording', JSON.stringify(short))
    let ended = short
    for (let i = 0; i < 30 && ended.state === 'recording'; i++) {
      await new Promise(resolve => setTimeout(resolve, 200))
      ended = await call('get_system_trace_status', { traceId: short.trace_id })
    }
    if (ended.artifact) artifacts.push(ended.artifact.path)
    assert.equal(ended.state, 'completed', JSON.stringify(ended)); assert.equal(ended.completion_reason, 'duration_limit')
    const durationContent = inspectPerfetto(await fs.readFile(ended.artifact.path), 1001)
    const shutdownClient = new Client({ name: 'system-trace-shutdown-smoke', version: '1.0.0' })
    const shutdownTransport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
    let shutdownTrace: any
    let shutdownDiagnostics = ''
    try {
      await shutdownClient.connect(shutdownTransport)
      shutdownTransport.stderr?.on('data', data => { shutdownDiagnostics += String(data) })
      shutdownTrace = parse(await shutdownClient.callTool({ name: 'start_system_trace', arguments: { ...target, durationMs: 30000 } }, undefined, { timeout: 120000 }))
      assert.equal(shutdownTrace.state, 'recording')
    } finally { await shutdownClient.close() }
    const remote = shutdownTrace.cleanup.remaining_resources.find((r: string) => r.startsWith('/data/misc/perfetto-traces/mcp-'))
    assert.ok(remote)
    const absent = await execCmd(getAdbCmd(), ['-s', device.id, 'shell', 'test', '!', '-e', remote], { timeout: 10000 })
    assert.equal(absent.exitCode, 0, `Shutdown must stop and remove its owned device capture: ${shutdownTrace.trace_id}; ${shutdownDiagnostics}; ${absent.stderr}`)
    const buildHash = createHash('sha256')
    for (const file of ['dist/server.js', 'dist/observe/system-trace.js', 'dist/observe/system-trace-android.js', 'dist/server/handlers/tool-handlers.js', 'dist/observe/evidence.js']) buildHash.update(await fs.readFile(file))
    const report = { status: 'PASS', build_sha256: buildHash.digest('hex'), runtime: process.version, server: client.getServerVersion(), device: device.id, osVersion: device.osVersion,
      starting_state: 'System Settings fixture', journey: 'start Settings, assert baseline Settings-owned resource visible in UI tree; explicit trace association',
      trace_id: start.trace_id, correlation_id: journey.evidence.correlation_id, phases: {
        capture_started_at_ms: stop.capture_started_at_ms, capture_completed_at_ms: stop.capture_completed_at_ms },
      artifact_bytes: stop.artifact.size_bytes, content, durationContent, cancel: 'PASS', expired_journey: 'PASS', active_shutdown: 'PASS',
      cleanup: 'Device capture files removed; test host artifacts removed in finally. No settings or app data changed. Settings remains foreground.' }
    console.log(JSON.stringify(report))
    if (process.env.SYSTEM_TRACE_EVIDENCE_PATH) await fs.writeFile(process.env.SYSTEM_TRACE_EVIDENCE_PATH, JSON.stringify(report, null, 2) + '\n')
  } finally {
    const cleanupErrors: string[] = []
    for (const traceId of owned) {
      try { const r = await call('cancel_system_trace', { traceId }); if (r.artifact && !artifacts.includes(r.artifact.path)) artifacts.push(r.artifact.path); if (r.cleanup?.status !== 'complete') cleanupErrors.push(traceId) } catch { cleanupErrors.push(traceId) }
    }
    await client.close()
    for (const file of artifacts) await fs.rm(path.dirname(file), { recursive: true, force: true })
    assert.deepEqual(cleanupErrors, [], 'Owned trace cleanup failed')
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
