import assert from 'node:assert/strict'
import { createObservationMeasurement, recordObservationConsumer, withObservationContext } from '../../../src/observe/performance-metrics.js'

async function run() {
  const previousFlag = process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS
  const previousWrite = process.stderr.write
  const lines: string[] = []
  process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS = '1'
  ;(process.stderr as any).write = (chunk: string) => { lines.push(chunk); return true }
  try {
    const tree = { elements: [{ text: 'private UI value' }] }
    await withObservationContext({ stepId: 'tap-1', purpose: 'target' }, async () => {
      const measurement = createObservationMeasurement('android')
      await measurement.physicalRead(async () => '<hierarchy/>')
      measurement.bindObservation(tree)
      measurement.setOutcome('observed')
      measurement.finish()
      recordObservationConsumer(tree, 'verification', 'tap-1')
    })
    const events = lines.map((line) => JSON.parse(line))
    const starts = events.filter((event) => event.type === 'physical_read_started')
    const completed = events.filter((event) => event.type === 'physical_read_completed')
    const acquisitions = events.filter((event) => event.type === 'acquisition_completed')
    const consumers = events.filter((event) => event.type === 'observation_consumer')
    assert.equal(starts.length, 1)
    assert.equal(completed.length, 1)
    assert.equal(acquisitions.length, 1)
    assert.equal(consumers.length, 2)
    assert.ok(events.every((event) => event.acquisition_id === starts[0].acquisition_id))
    assert.equal(consumers[1].consumer_purpose, 'verification')
    assert.equal(consumers[1].reused_observations, 1)
    assert.equal(lines.join('').includes('private UI value'), false)
  } finally {
    ;(process.stderr as any).write = previousWrite
    if (previousFlag === undefined) delete process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS
    else process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS = previousFlag
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
