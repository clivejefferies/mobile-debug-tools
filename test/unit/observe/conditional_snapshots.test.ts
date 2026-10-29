import assert from 'node:assert/strict'
import { deriveSnapshotMetadata, hasSnapshotBaseline, resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'

const originalNow = Date.now
try {
  resetSnapshotMetadataForTests()
  let now = originalNow()
  Date.now = () => now
  const body = { screen: '', resolution: { width: 100, height: 200 }, elements: Array.from({ length: 501 }, (_, index) => ({ text: `Item ${index}`, stable_id: `item-${index}`, visible: true, bounds: [0, index, 20, index + 1] })) }
  const first = deriveSnapshotMetadata('android:fixture', body, 'ui_tree')
  assert.equal(hasSnapshotBaseline('android:other', first.snapshot_revision), false)
  assert.equal(hasSnapshotBaseline('android:fixture', first.snapshot_revision), true)
  now += 9 * 60 * 1000
  const repeat = deriveSnapshotMetadata('android:fixture', body, 'ui_tree')
  assert.equal(repeat.snapshot_revision, first.snapshot_revision)
  now += 2 * 60 * 1000
  assert.equal(hasSnapshotBaseline('android:fixture', repeat.snapshot_revision), true, 'successful re-observation refreshes retention')
  const changed = structuredClone(body)
  changed.elements[500].text = 'Changed beyond delta history limit'
  const second = deriveSnapshotMetadata('android:fixture', changed, 'ui_tree')
  assert.notEqual(second.snapshot_revision, first.snapshot_revision, 'every element contributes to conditional revision')
  assert.equal(second.snapshot_session_id, first.snapshot_session_id)
  now += 11 * 60 * 1000
  assert.equal(hasSnapshotBaseline('android:fixture', second.snapshot_revision), false)
  const fresh = deriveSnapshotMetadata('android:fixture', changed, 'ui_tree')
  assert.equal(hasSnapshotBaseline('android:fixture', fresh.snapshot_revision), true)
  const failed = deriveSnapshotMetadata('android:empty', null, 'ui_tree')
  assert.equal(hasSnapshotBaseline('android:empty', failed.snapshot_revision), false, 'error metadata never creates a baseline')
  console.log('Conditional snapshot retention/session coverage: PASS')
} finally {
  Date.now = originalNow
  resetSnapshotMetadataForTests()
}
