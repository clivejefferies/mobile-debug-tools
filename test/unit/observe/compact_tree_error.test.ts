import assert from 'node:assert/strict'
import { AndroidObserve, ToolsObserve } from '../../../src/observe/index.js'
import { deriveSnapshotMetadata, resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'
import { withResolvedDevice } from '../../../src/utils/resolve-device.js'

async function run() {
  const original = AndroidObserve.prototype.getUITree
  const device = { platform: 'android', id: 'fixture', model: 'Fixture', osVersion: '16', simulator: true }
  const body = { screen: '', resolution: { width: 100, height: 200 }, elements: [] }
  const metadata = deriveSnapshotMetadata('android:fixture', body, 'ui_tree')
  AndroidObserve.prototype.getUITree = async () => ({ ...body, device, ...metadata, error: 'observation unavailable' })
  try {
    const compact: any = await withResolvedDevice(device, () => ToolsObserve.getUITreeHandler({ platform: 'android', deviceId: 'fixture', responseMode: 'compact', sinceSnapshotRevision: metadata.snapshot_revision }))
    assert.equal(compact.error, 'observation unavailable', 'compact observations must not conceal an error behind a retained revision')
    assert.equal(compact.delta_available, false)
    assert.equal(compact.snapshot_session_id, metadata.snapshot_session_id)
    assert.equal(compact.state_delta, undefined)
    console.log('Compact UI-tree error evidence: PASS')
  } finally {
    AndroidObserve.prototype.getUITree = original
    resetSnapshotMetadataForTests()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
