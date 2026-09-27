import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { iOSObserve } from '../../../src/observe/ios.js'
import { resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-fake-idb-'))
  const idbPath = path.join(directory, 'idb')
  const xcrunPath = path.join(directory, 'xcrun')
  const previousIdb = process.env.IDB_PATH
  const previousXcrun = process.env.XCRUN_PATH
  const previousMetrics = process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS
  const previousSlow = process.env.MCP_FAKE_IDB_SLOW
  const previousMarker = process.env.MCP_FAKE_IDB_CLOSE_MARKER
  const previousWrite = process.stderr.write
  const lines: string[] = []
  writeFileSync(idbPath, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ')
if (args.includes('list-targets')) console.log('[]')
else if (args.includes('ui describe-all')) {
  if (process.env.MCP_FAKE_IDB_SLOW === '1') {
    process.on('SIGTERM', () => setTimeout(() => { require('fs').writeFileSync(process.env.MCP_FAKE_IDB_CLOSE_MARKER, 'closed'); process.exit(0) }, 50))
    setInterval(() => {}, 1000)
  } else console.log(JSON.stringify({ AXElementType: 'Button', AXLabel: 'Ready', AXFrame: { x: 0, y: 0, width: 50, height: 50 } }))
}
else process.exit(1)
`)
  writeFileSync(xcrunPath, `#!/usr/bin/env node
console.log(JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [{ udid: 'fake-a', name: 'Fake iPhone' }, { udid: 'fake-b', name: 'Fake iPhone' }] } }))
`)
  chmodSync(idbPath, 0o755)
  chmodSync(xcrunPath, 0o755)
  process.env.IDB_PATH = idbPath
  process.env.XCRUN_PATH = xcrunPath
  process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS = '1'
  ;(process.stderr as any).write = (chunk: string) => { lines.push(chunk); return true }
  resetSnapshotMetadataForTests()
  try {
    const observe = new iOSObserve()
    const first = await observe.getUITree('fake-a')
    const second = await observe.getUITree('fake-b')
    assert.equal(first.error, undefined)
    assert.equal(second.error, undefined)
    assert.equal(first.elements[0].text, 'Ready')
    assert.equal(second.snapshot_delta, null, 'different simulators keep independent delta history')
    const events = lines.map((line) => JSON.parse(line))
    assert.equal(events.filter((event) => event.type === 'physical_read_started').length, 2)
    assert.equal(events.filter((event) => event.type === 'physical_read_completed' && event.success).length, 2)
    const marker = path.join(directory, 'idb-closed')
    process.env.MCP_FAKE_IDB_SLOW = '1'
    process.env.MCP_FAKE_IDB_CLOSE_MARKER = marker
    await assert.rejects(() => runWithBudget(1200, () => observe.getUITree('fake-a')), /ACTION_TIMEOUT/)
    assert.equal(existsSync(marker), true, 'budget expiry waits for idb child close')
    delete process.env.MCP_FAKE_IDB_SLOW
    const recovered = await observe.getUITree('fake-a')
    assert.equal(recovered.error, undefined, 'a cancelled iOS observation is not reused')
  } finally {
    ;(process.stderr as any).write = previousWrite
    if (previousIdb === undefined) delete process.env.IDB_PATH
    else process.env.IDB_PATH = previousIdb
    if (previousXcrun === undefined) delete process.env.XCRUN_PATH
    else process.env.XCRUN_PATH = previousXcrun
    if (previousMetrics === undefined) delete process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS
    else process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS = previousMetrics
    if (previousSlow === undefined) delete process.env.MCP_FAKE_IDB_SLOW
    else process.env.MCP_FAKE_IDB_SLOW = previousSlow
    if (previousMarker === undefined) delete process.env.MCP_FAKE_IDB_CLOSE_MARKER
    else process.env.MCP_FAKE_IDB_CLOSE_MARKER = previousMarker
    rmSync(directory, { recursive: true, force: true })
    resetSnapshotMetadataForTests()
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
