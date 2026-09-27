import assert from 'assert'
import { deriveSnapshotMetadata, getStateDelta, resetSnapshotMetadataForTests } from '../../../src/observe/snapshot-metadata.js'

async function run() {
  console.log('Starting snapshot_metadata unit tests...')

  resetSnapshotMetadataForTests()

  const deviceKey = 'android:mock'
  const first = deriveSnapshotMetadata(deviceKey, {
    screen: 'Home',
    resolution: { width: 100, height: 200 },
    elements: [
      {
        text: 'Alpha',
        contentDescription: null,
        resourceId: 'row_1',
        type: 'TextView',
        clickable: false,
        enabled: true,
        visible: true,
        bounds: [0, 0, 10, 10],
        state: null,
        stable_id: 'stable-row'
      }
    ]
  }, 'ui_tree')

  assert.strictEqual(first.snapshot_revision, 1)
  assert.strictEqual(first.snapshot_delta, null)

  const second = deriveSnapshotMetadata(deviceKey, {
    screen: 'Home',
    resolution: { width: 100, height: 200 },
    elements: [
      {
        text: 'Beta',
        contentDescription: null,
        resourceId: 'row_1',
        type: 'TextView',
        clickable: false,
        enabled: true,
        visible: true,
        bounds: [0, 0, 10, 10],
        state: null,
        stable_id: 'stable-row'
      }
    ]
  }, 'ui_tree')

  assert.strictEqual(second.snapshot_revision, 2)
  assert.deepStrictEqual(second.snapshot_delta, {
    previous_snapshot_revision: 1,
    added_elements: 0,
    removed_elements: 0,
    mutated_elements: 1,
    total_elements: 1
  })

  const delta = getStateDelta(deviceKey, 1, 2)
  assert.ok(delta)
  assert.strictEqual(delta!.added.length, 0)
  assert.strictEqual(delta!.removed.length, 0)
  assert.strictEqual(delta!.changed.length, 1)
  assert.strictEqual(delta!.changed[0].text, 'Beta')
  assert.strictEqual(delta!.truncated, false)
  assert.strictEqual(getStateDelta(deviceKey, 99, 2), null)

  for (let index = 3; index <= 10; index++) {
    deriveSnapshotMetadata(deviceKey, {
      screen: 'Home',
      resolution: { width: 100, height: 200 },
      elements: [{ text: `Revision ${index}`, stable_id: 'stable-row', visible: true }]
    }, 'ui_tree')
  }
  assert.ok(getStateDelta(deviceKey, 3, 10), 'recent revisions remain available after pruning')
  assert.strictEqual(getStateDelta(deviceKey, 2, 10), null, 'only the oldest revision is pruned')

  resetSnapshotMetadataForTests()
  console.log('snapshot_metadata unit tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
