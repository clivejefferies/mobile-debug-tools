import assert from 'node:assert/strict'
import { deriveSnapshotMetadata, getStateDelta, getLatestStateDelta, resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'
resetSnapshotMetadataForTests()
const tree = (text: string) => ({ elements: [{ stable_id: 'one', text }, { stable_id: 'unchanged', text: 'fixed' }] }) as any
const first = deriveSnapshotMetadata('android:test', tree('before'), 'test')
const second = deriveSnapshotMetadata('android:test', tree('after'), 'test')
const delta = getStateDelta('android:test', first.snapshot_revision, second.snapshot_revision)!
assert.equal(delta.changed.length, 1)
assert.equal(delta.changed[0].text, 'after')
deriveSnapshotMetadata('android:test', tree('after'), 'test')
assert.equal(getLatestStateDelta('android:test')!.changed.length, 0)
const large = { elements: Array.from({ length: 501 }, (_, i) => ({ stable_id: String(i), text: String(i) })) } as any
const third = deriveSnapshotMetadata('android:test', large, 'test')
assert.equal(getStateDelta('android:test', second.snapshot_revision, third.snapshot_revision)!.truncated, true)
assert.equal(getStateDelta('android:test', -1, third.snapshot_revision), null)
