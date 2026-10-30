import assert from 'node:assert/strict'
import { handleToolCall, toolDefinitions } from '../../../src/server-core.js'
import { systemTraces } from '../../../src/observe/system-trace.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import { AndroidManage } from '../../../src/manage/index.js'
import { withEvidence, bindSystemTrace, bindEvidenceDevice } from '../../../src/observe/evidence.js'

const parse = (r: any) => JSON.parse(r.content[0].text)
async function run() {
  const originalLink = systemTraces.link, originalStart = systemTraces.start, originalControl = systemTraces.control
  const originalApp = AndroidManage.prototype.startApp
  const id = '62a51510-c303-4a1b-af0e-f97cc976d740'
  let dispatched = 0, starts = 0
  _setDeviceListersForTests({ listAndroidDevices: async () => [{ id: 'trace-device', platform: 'android', osVersion: '16', simulator: true, model: 'fixture' }] })
  try {
    for (const name of ['get_system_trace_capabilities', 'start_system_trace', 'get_system_trace_status', 'stop_system_trace', 'cancel_system_trace']) {
      const tool = toolDefinitions.find(t => t.name === name)
      assert.ok(tool); assert.equal(tool.inputSchema.additionalProperties, false)
    }
    assert.equal(toolDefinitions.find(t => t.name === 'run_journey').inputSchema.properties.systemTraceId.format, 'uuid')
    for (const args of [ {}, { platform: 'android', extra: true }, { platform: 'android', expectedState: {} }, { platform: 'android', durationMs: 0 }, { platform: 'android', durationMs: 1000.5 }, { platform: 'android', durationMs: 120001 } ]) {
      const r = await handleToolCall('start_system_trace', args)
      assert.equal(r.isError, true); assert.equal(parse(r).error.code, 'INVALID_ARGUMENT')
    }
    systemTraces.start = async () => { starts++; throw new Error('must not run') }
    const ios = await handleToolCall('start_system_trace', { platform: 'ios' })
    assert.equal(parse(ios).error.code, 'UNSUPPORTED_PLATFORM'); assert.equal(starts, 0)
    assert.equal(parse(await handleToolCall('get_system_trace_capabilities', { platform: 'ios' })).supported, false)
    for (const name of ['stop_system_trace', 'cancel_system_trace', 'get_system_trace_status']) {
      assert.equal(parse(await handleToolCall(name, { traceId: id, deviceId: 'wrong' })).error.code, 'INVALID_ARGUMENT')
      assert.equal(parse(await handleToolCall(name, { traceId: id })).error.code, 'TRACE_NOT_FOUND')
    }
    AndroidManage.prototype.startApp = async () => { dispatched++; return { appStarted: true } as any }
    const journey = { platform: 'android', deviceId: 'trace-device', systemTraceId: id, steps: [{ id: 'start', type: 'start_app', appId: 'com.android.settings', verificationMode: 'none' }] }
    const rejected = await handleToolCall('run_journey', journey)
    assert.equal(rejected.isError, true); assert.equal(dispatched, 0)
    let correlation = ''
    systemTraces.link = async (trace, device, cid) => {
      assert.equal(trace, id); assert.equal(device.id, 'trace-device'); correlation = cid
      return async () => ({ trace_id: trace, coverage: 'covered', clock_alignment: 'unknown' })
    }
    const result = parse(await handleToolCall('run_journey', journey))
    assert.equal(result.success, true, JSON.stringify(result)); assert.equal(dispatched, 1)
    assert.equal(result.evidence.trace_context.trace_id, id)
    assert.equal(result.evidence.trace_context.supported, true)
    assert.equal(result.evidence.correlation_id, correlation)
    assert.equal(result.steps[0].result.evidence.trace_context.trace_id, id)
    assert.equal(result.steps[0].result.evidence.correlation_id, correlation)
    assert.equal(result.system_trace.coverage, 'covered')
    const plain = parse(await handleToolCall('run_journey', { ...journey, systemTraceId: undefined }))
    assert.deepEqual(plain.evidence.trace_context, { supported: false, trace_id: null, markers: [] })
    const [linked, independent] = await Promise.all([
      withEvidence({ journey: true }, async () => { bindSystemTrace(id); bindEvidenceDevice({ platform: 'android', id: 'trace-device' }); return withEvidence({ action: true }, async () => {}) }),
      withEvidence({ journey: true }, async () => {})
    ])
    assert.equal(linked.result.evidence.trace_context.trace_id, id)
    assert.equal(independent.evidence.trace_context.trace_id, null)
    console.log('system trace tool contracts and journey evidence: PASS')
  } finally {
    systemTraces.link = originalLink; systemTraces.start = originalStart; systemTraces.control = originalControl
    AndroidManage.prototype.startApp = originalApp; _resetDeviceListersForTests()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
