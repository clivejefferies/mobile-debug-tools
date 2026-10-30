import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleToolCall, toolDefinitions } from '../../../src/server-core.js'
import { AndroidObserve } from '../../../src/observe/android.js'
import { iOSObserve, _setIOSActiveLogStream, _clearIOSActiveLogStream } from '../../../src/observe/ios.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'
import { deriveSnapshotMetadata } from '../../../src/observe/snapshot-metadata.js'

async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-evidence-'))
  const binary = path.join(directory, 'native')
  const events = path.join(directory, 'events')
  const keys = ['ADB_PATH', 'IDB_PATH', 'MCP_IDB_PATH', 'XCRUN_PATH', 'EVIDENCE_FAIL_INPUT', 'EVIDENCE_INPUT_SLOW']
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  writeFileSync(events, '')
  writeFileSync(binary, `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2).join(' ')
fs.appendFileSync(${JSON.stringify(events)}, args + '\\n')
if (args.includes('ro.build.version.release')) console.log('16')
else if (args.includes('ro.product.model')) console.log('Fixture')
else if (args.includes('ro.kernel.qemu')) console.log('1')
else if (args.includes('simctl list devices')) console.log(JSON.stringify({devices:{'iOS-18':[{udid:'fixture-ios',name:'Fixture',state:'Booted'}]}}))
else if (args.includes('list-targets')) console.log('[]')
else if (args.includes('shell input') || args.includes('ui tap') || args.includes('ui swipe')) { if (process.env.EVIDENCE_FAIL_INPUT) process.exit(1); if (process.env.EVIDENCE_INPUT_SLOW) setTimeout(() => process.exit(0), 2000) }
else if (args.includes('pidof')) console.log('123')
else if (args.includes('logcat')) { console.log('2026-10-30 10:00:00.000 123 123 I Fixture: stream-owned'); setInterval(() => {}, 1000) }
else if (args.includes('monkey') || args.includes('simctl launch')) console.log('launched: 123')
else process.exit(1)
`)
  chmodSync(binary, 0o755)
  for (const key of keys.slice(0, 4)) process.env[key] = binary
  const device = (platform: 'android' | 'ios', id?: string) => ({ platform, id: id ?? `fixture-${platform}`, osVersion: '16', model: 'Fixture', simulator: true })
  _setDeviceListersForTests({ listAndroidDevices: async () => [device('android'), device('android', 'other')], listIOSDevices: async () => [device('ios')] })
  const originals: Array<() => void> = []
  let captureCount = 0
  let failScreenshot = false
  for (const [platform, klass] of [['android', AndroidObserve], ['ios', iOSObserve]] as const) {
    const prototype = klass.prototype as any
    const replace = (name: string, fn: (...args: any[]) => any) => {
      const original = prototype[name]; originals.push(() => { prototype[name] = original }); prototype[name] = fn
    }
    replace('collectGetUITree', async (id: string) => {
      captureCount++
      const body = { device: device(platform, id), elements: [{ text: 'Ready', resourceId: 'target', contentDescription: 'target', type: 'Button', clickable: true, enabled: true, visible: true, bounds: [0, 0, 50, 50] }], resolution: { width: 100, height: 200 }, screen: 'Ready' }
      return { ...body, ...deriveSnapshotMetadata(`${platform}:${id}`, body as any, 'ui_tree') }
    })
    replace(platform === 'android' ? 'collectCaptureScreen' : 'collectCaptureScreenshot', async (id: string) => {
      captureCount++
      if (failScreenshot) throw new Error('screenshot offline')
      return { device: device(platform, id), screenshot: 'fixture-image', screenshot_mime: 'image/png', resolution: { width: 100, height: 200 } }
    })
    replace('collectGetLogs', async (filters: any) => {
      captureCount++
      return { device: device(platform, filters.deviceId), logs: [{ timestamp: '2020-01-01T00:00:00Z', level: 'INFO', message: 'preserved' }], logCount: 1 }
    })
    if (platform === 'android') replace('collectGetCurrentScreen', async (id: string) => ({ device: device(platform, id), activity: 'FixtureActivity', package: 'fixture.app' }))
  }
  const payload = (r: any) => JSON.parse(r.content[0].text)
  const call = async (name: string, args: Record<string, unknown>) => payload(await handleToolCall(name, args))
  const refFor = (value: any) => ({ sessionId: value.evidence.session_id, actionId: value.evidence.action_id })
  try {
    for (const platform of ['android', 'ios'] as const) {
      const target = { platform, deviceId: `fixture-${platform}` }
      for (const responseMode of ['compact', 'debug']) {
        const a = await call('tap', { ...target, responseMode, verificationMode: 'none', x: 10, y: 10 })
        assert.equal(a.success, true)
        assert.equal(a.action_id, a.evidence.action_id)
        assert.equal(a.evidence.action_id, a.evidence.correlation_id)
        assert.ok(a.evidence.dispatch_started_at_ms)
        assert.ok(a.evidence.dispatch_completed_at_ms >= a.evidence.dispatch_started_at_ms)
        assert.equal(a.evidence.verification_completed_at_ms, null)
        if (responseMode === 'debug') assert.equal(a.trace.action_id, a.action_id)
        const actionRef = refFor(a)
        const image = await handleToolCall('capture_screenshot', { ...target, actionRef })
        const imageMeta = payload(image)
        assert.equal(imageMeta.evidence.action_id, a.action_id)
        assert.equal(imageMeta.evidence.correlation_id, a.evidence.correlation_id)
        assert.equal(image.content[1].data, 'fixture-image')
        assert.equal(imageMeta.evidence.observations[0].freshness, 'fresh')
        const logs = await handleToolCall('get_logs', { ...target, actionRef })
        assert.equal(payload(logs).evidence.action_id, a.action_id)
        assert.equal(JSON.parse(logs.content[1].text!).logs[0].message, 'preserved')
        assert.equal(payload(logs).evidence.observations[0].event_time_comparable, false)
        const tree = await call('get_ui_tree', { ...target, responseMode, actionRef })
        assert.equal(tree.evidence.action_id, a.action_id)
        assert.ok(tree.evidence.observations[0].snapshot_revision)
        const verified = await call('tap', { ...target, responseMode, verificationMode: 'full', x: 10, y: 10 })
        assert.ok(verified.evidence.verification_completed_at_ms >= verified.evidence.dispatch_completed_at_ms)
        assert.ok(verified.evidence.observations.some((v: any) => v.freshness_reasons.includes('BEFORE_ACTION')))
        assert.ok(verified.evidence.observations.some((v: any) => v.freshness === 'fresh'))
        process.env.EVIDENCE_FAIL_INPUT = '1'
        const failed = await call('tap', { ...target, responseMode, verificationMode: 'none', x: 10, y: 10 })
        assert.equal(failed.success, false)
        assert.ok(failed.evidence.dispatch_started_at_ms)
        assert.equal(failed.evidence.verification_completed_at_ms, null)
        delete process.env.EVIDENCE_FAIL_INPUT
        const blocked = await call('tap', { ...target, responseMode, verificationMode: 'none', x: 10, y: 10,
          expectedState: { snapshotSessionId: 'expired-session', snapshotRevision: 1 } })
        assert.equal(blocked.failure_code, 'PRECONDITION_UNAVAILABLE')
        assert.equal(blocked.evidence.dispatch_started_at_ms, null)
        assert.equal(blocked.evidence.verification_completed_at_ms, null)
      }
      failScreenshot = true
      const partial = await call('capture_debug_snapshot', { ...target, includeLogs: false })
      assert.equal(partial.raw.screenshot_error, 'screenshot offline')
      assert.equal(partial.evidence.observations.find((v: any) => v.kind === 'screenshot').status, 'failed')
      assert.equal(partial.evidence.observations.find((v: any) => v.kind === 'logs').status, 'omitted')
      failScreenshot = false
      const disabled = await call('capture_debug_snapshot', { ...target, includeScreenshot: false, includeLogs: false })
      assert.equal(disabled.raw.screenshot, null)
      assert.equal(disabled.evidence.observations.find((v: any) => v.kind === 'screenshot').status, 'omitted')
      const snapshot = await call('capture_debug_snapshot', target)
      assert.equal(snapshot.raw.screenshot, 'fixture-image')
      assert.equal(snapshot.raw.logs[0].message, 'preserved')
      assert.ok(snapshot.evidence.observations.every((v: any) => !v.device || v.device.id === target.deviceId))
    }
    process.env.EVIDENCE_INPUT_SLOW = '1'
    const timeout = await call('tap', { platform: 'android', deviceId: 'fixture-android', x: 1, y: 1,
      verificationMode: 'none', responseMode: 'compact', actionTimeoutMs: 500 })
    delete process.env.EVIDENCE_INPUT_SLOW
    assert.equal(timeout.failure_code, 'ACTION_TIMEOUT')
    assert.ok(timeout.evidence.dispatch_started_at_ms)
    assert.ok(timeout.evidence.dispatch_completed_at_ms)
    assert.equal(timeout.evidence.verification_completed_at_ms, null)
    const before = captureCount
    const malformed = await call('capture_screenshot', { platform: 'android', actionRef: { actionId: '' } })
    assert.match(malformed.error.message, /INVALID_ARGUMENT/)
    assert.equal(captureCount, before)
    const a = await call('tap', { platform: 'android', deviceId: 'fixture-android', x: 1, y: 1, verificationMode: 'none' })
    const mismatch = await call('capture_screenshot', { platform: 'android', deviceId: 'other', actionRef: refFor(a) })
    assert.equal(mismatch.evidence.association_reason, 'DEVICE_MISMATCH')
    assert.notEqual(mismatch.evidence.correlation_id, a.evidence.correlation_id)
    const journey = await call('run_journey', { platform: 'android', deviceId: 'fixture-android', responseMode: 'debug',
      defaults: { verificationMode: 'full' }, steps: [{ id: 'one', type: 'start_app', appId: 'fixture.app' }, { id: 'two', type: 'start_app', appId: 'fixture.app' }] })
    assert.equal(journey.success, true)
    assert.equal(journey.steps[0].result.evidence.correlation_id, journey.evidence.correlation_id)
    assert.equal(journey.steps[1].result.evidence.correlation_id, journey.evidence.correlation_id)
    assert.notEqual(journey.steps[0].result.evidence.action_id, journey.steps[1].result.evidence.action_id)
    assert.ok(journey.steps[0].result.evidence.observations.some((v: any) => v.freshness === 'stale'))

    assert.ok(journey.steps[0].result.evidence.operation_completed_at_ms <= journey.steps[1].result.evidence.operation_started_at_ms)
    const light = await call('run_journey', { platform: 'android', deviceId: 'fixture-android', responseMode: 'compact',
      defaults: { verificationMode: 'light' }, steps: [
        { id: 'tap', type: 'tap', selector: { accessibility_id: 'target' } },
        { id: 'verify', type: 'assert', assertion: { kind: 'element_visible', selector: { accessibility_id: 'target' } } }
      ] })
    assert.equal(light.success, true)
    const lightStep = light.steps[0].result
    assert.ok(lightStep.evidence.verification_completed_at_ms)
    const afterLight = await call('capture_screenshot', { platform: 'android', deviceId: 'fixture-android', actionRef: refFor(lightStep) })
    assert.equal(afterLight.evidence.verification_completed_at_ms, lightStep.evidence.verification_completed_at_ms)

    const started = await call('start_log_stream', { platform: 'android', deviceId: 'other', sessionId: 'evidence-owned', packageName: 'fixture.app' })
    assert.equal(started.success, true)
    let androidStream: any
    for (let i = 0; i < 100; i++) {
      androidStream = await call('read_log_stream', { platform: 'android', sessionId: 'evidence-owned', actionRef: refFor(a) })
      if (androidStream.entries.length) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.ok(androidStream.entries.length)
    assert.equal(androidStream.evidence.device.id, 'other')
    assert.equal(androidStream.evidence.association_reason, 'DEVICE_MISMATCH')
    assert.match(readFileSync(events, 'utf8'), /-s other logcat/)
    assert.equal((await call('stop_log_stream', { platform: 'android', sessionId: 'evidence-owned' })).success, true)
    const streamFile = path.join(directory, 'stream.ndjson')
    writeFileSync(streamFile, JSON.stringify({ message: 'stream-owned', _iso: '2020-01-01T00:00:00Z' }) + '\n')
    _setIOSActiveLogStream('owned', streamFile, { platform: 'ios', id: 'fixture-ios' })
    // Discovery returning a different device must not retarget this stream read.
    _setDeviceListersForTests({ listIOSDevices: async () => { throw new Error('discovery must not run') } })
    const stream = await call('read_log_stream', { platform: 'ios', sessionId: 'owned' })
    assert.equal(stream.entries[0].message, 'stream-owned')
    assert.equal(stream.evidence.device.id, 'fixture-ios')
    assert.equal(stream.evidence.observations[0].device.id, 'fixture-ios')
    for (const name of ['capture_screenshot', 'get_ui_tree', 'get_screen_fingerprint', 'capture_debug_snapshot', 'get_logs', 'read_log_stream']) {
      assert.ok((toolDefinitions.find(v => v.name === name)!.inputSchema.properties as any).actionRef)
    }
    assert.match(readFileSync(events, 'utf8'), /shell input tap/)
    assert.match(readFileSync(events, 'utf8'), /ui tap/)
  } finally {
    await new AndroidObserve().stopLogStream('evidence-owned')
    rmSync(path.join(tmpdir(), 'mobile-debug-log-evidence-owned.ndjson'), { force: true })
    _clearIOSActiveLogStream('owned')
    for (const restore of originals) restore()
    _resetDeviceListersForTests()
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    rmSync(directory, { recursive: true, force: true })
  }
  console.log('Correlated MCP response, native dispatch, snapshot, journey and stream contracts: PASS')
}
run().catch(error => { console.error(error); process.exit(1) })
