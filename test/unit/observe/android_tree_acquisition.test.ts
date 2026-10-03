import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AndroidObserve } from '../../../src/observe/android.js'
import { resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-fake-adb-'))
  const adbPath = path.join(directory, 'adb')
  const previousAdb = process.env.ADB_PATH
  const previousMetrics = process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS
  const previousBridgeApk = process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK
  const previousFailure = process.env.MCP_FAKE_ADB_FAIL
  const previousWrite = process.stderr.write
  const lines: string[] = []
  writeFileSync(adbPath, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ')
if (args.includes('ro.build.version.release')) console.log('16')
else if (args.includes('ro.product.model')) console.log('Fake Android')
else if (args.includes('ro.kernel.qemu')) console.log('1')
else if (args.includes('wm size')) console.log('Physical size: 100x200')
else if (args.includes('uiautomator dump')) { if (process.env.MCP_FAKE_ADB_FAIL === '1') process.exit(1); if (process.env.MCP_FAKE_ADB_FAIL === 'idle') console.log('ERROR: could not get idle state.'); else { process.stdout.write('<?xml version="1.0"?><hierarchy><node class="android.widget.TextView" text="Ready" bounds="[0,0][50,50]" /></hierarchy>'); if (process.env.MCP_FAKE_ADB_FAIL !== 'truncated') console.log('UI hierchary dumped to: /dev/stdout') } }
else process.exit(1)
`)
  chmodSync(adbPath, 0o755)
  process.env.ADB_PATH = adbPath
  process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS = '1'
  process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK = path.join(directory, 'missing-bridge.apk')
  ;(process.stderr as any).write = (chunk: string) => { lines.push(chunk); return true }
  resetSnapshotMetadataForTests()
  try {
    const observe = new AndroidObserve()
    const first = await observe.getUITree('fake-a')
    const second = await observe.getUITree('fake-b')
    assert.equal(first.error, undefined)
    assert.equal(second.error, undefined)
    assert.equal(first.snapshot_revision, 1)
    assert.notEqual(first.snapshot_revision, second.snapshot_revision)
    assert.equal(second.snapshot_delta, null, 'different devices keep independent delta history')
    assert.equal(first.elements[0].text, 'Ready')
    process.env.MCP_FAKE_ADB_FAIL = '1'
    const failed = await runWithBudget(1000, () => observe.getUITree('fake-a'))
    assert.ok(failed.error)
    process.env.MCP_FAKE_ADB_FAIL = 'idle'
    const idleFailed = await runWithBudget(1000, () => observe.getUITree('fake-a'))
    assert.ok(idleFailed.error, 'an idle-state error must not return stale XML from an earlier dump')
    process.env.MCP_FAKE_ADB_FAIL = 'truncated'
    const truncated = await runWithBudget(1000, () => observe.getUITree('fake-a'))
    assert.ok(truncated.error, 'a partial dump must not be treated as a complete hierarchy')
    delete process.env.MCP_FAKE_ADB_FAIL
    const recovered = await observe.getUITree('fake-a')
    assert.equal(recovered.error, undefined, 'the next request takes a fresh physical read')
    const events = lines.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line))
    const started = events.filter((event) => event.type === 'physical_read_started')
    const completed = events.filter((event) => event.type === 'physical_read_completed')
    assert.equal(started.length, completed.length)
    assert.ok(started.length >= 4)
    assert.equal(events.filter((event) => event.type === 'physical_read_completed' && event.success).length, 3)
    assert.ok(events.some((event) => event.type === 'physical_read_completed' && !event.success))
    const successfulAcquisitions = new Set(events.filter((event) => event.type === 'acquisition_completed' && event.outcome === 'observed').map((event) => event.acquisition_id))
    assert.equal(events.filter((event) => event.stage === 'observation_wait_ms' && successfulAcquisitions.has(event.acquisition_id)).length, 0, 'successful first attempts have no pre-read wait')
  } finally {
    ;(process.stderr as any).write = previousWrite
    if (previousAdb === undefined) delete process.env.ADB_PATH
    else process.env.ADB_PATH = previousAdb
    if (previousMetrics === undefined) delete process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS
    else process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS = previousMetrics
    if (previousBridgeApk === undefined) delete process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK
    else process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK = previousBridgeApk
    if (previousFailure === undefined) delete process.env.MCP_FAKE_ADB_FAIL
    else process.env.MCP_FAKE_ADB_FAIL = previousFailure
    rmSync(directory, { recursive: true, force: true })
    resetSnapshotMetadataForTests()
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
