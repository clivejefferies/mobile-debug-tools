import assert from 'node:assert/strict'
import { withEvidence, captureEvidence, evidenceDispatch, currentEvidenceActionId, markEvidenceVerification, omitEvidence, validateActionRef, type EvidenceDevice } from '../../../src/observe/evidence.js'

async function run() {
  const android = { platform: 'android' as const, id: 'evidence-unit-android' }
  const ios = { platform: 'ios' as const, id: 'evidence-unit-ios' }
  const originalWall = Date.now
  const originalMono = Object.getOwnPropertyDescriptor(performance, 'now')
  let wall = 1000000
  let mono = 0
  Date.now = () => wall
  Object.defineProperty(performance, 'now', { configurable: true, value: () => mono })
  const tick = (n = 10) => { wall += n; mono += n }
  const observe = (device: EvidenceDevice = android) => captureEvidence('ui_tree', device, async () => {
    tick()
    return { device, captured_at_ms: wall, snapshot_session_id: 'tree-session', snapshot_revision: 1 }
  })
  const act = async (device: EvidenceDevice = android) => withEvidence({ action: true }, async () => {
    const id = currentEvidenceActionId()
    await evidenceDispatch(device, async () => { tick() })
    return id
  })
  try {
    const a = await withEvidence({ action: true }, async () => {
      await observe()
      tick()
      const id = currentEvidenceActionId()
      await evidenceDispatch(android, async () => { tick() })
      await observe()
      markEvidenceVerification()
      return id
    })
    assert.equal(a.evidence.action_id, a.result)
    assert.equal(a.evidence.correlation_id, a.result)
    assert.deepEqual(a.evidence.observations.map(v => v.freshness), ['stale', 'fresh'])
    assert.deepEqual(a.evidence.observations[0].freshness_reasons, ['BEFORE_ACTION'])
    assert.ok(a.evidence.dispatch_started_at_ms! < a.evidence.dispatch_completed_at_ms!)
    assert.ok(a.evidence.verification_completed_at_ms! >= a.evidence.dispatch_completed_at_ms!)
    assert.deepEqual(a.evidence.trace_context, { supported: false, trace_id: null, markers: [] })
    const ref = { sessionId: a.evidence.session_id, actionId: a.evidence.action_id! }
    const linked = await withEvidence({ ref }, () => observe())
    assert.equal(linked.evidence.association, 'explicit')
    assert.equal(linked.evidence.correlation_id, a.evidence.correlation_id)
    assert.equal(linked.evidence.verification_completed_at_ms, a.evidence.verification_completed_at_ms)
    assert.equal(linked.evidence.observations[0].snapshot_revision, 1)
    assert.ok(linked.evidence.observations[0].age_ms! >= 0)
    const mismatch = await withEvidence({ ref }, () => observe(ios))
    assert.equal(mismatch.evidence.association_reason, 'DEVICE_MISMATCH')
    assert.equal(mismatch.evidence.action_id, null)
    assert.notEqual(mismatch.evidence.correlation_id, a.evidence.correlation_id)
    const foreign = await withEvidence({ ref: { ...ref, sessionId: 'previous-process' } }, () => observe())
    assert.equal(foreign.evidence.association_reason, 'SESSION_MISMATCH')
    assert.equal(foreign.evidence.action_id, null)

    const oldSource = wall - 100
    const reused = await withEvidence({}, () => captureEvidence('ui_tree', ios, async () => ({ device: ios, captured_at_ms: oldSource })))
    assert.equal(reused.evidence.observations[0].source_captured_at_ms, oldSource)
    assert.deepEqual(reused.evidence.observations[0].freshness_reasons, ['REUSED_OBSERVATION'])
    const cachedBeforeAction = await withEvidence({ ref }, () => captureEvidence('ui_tree', android, async () => ({ captured_at_ms: a.evidence.operation_started_at_ms - 10 })))
    assert.deepEqual(cachedBeforeAction.evidence.observations[0].freshness_reasons, ['BEFORE_ACTION'])

    let release!: () => void
    let entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const pending = withEvidence({ action: true }, () => evidenceDispatch(android, async () => { entered(); await gate; tick() }))
    await ready
    const overlap = await withEvidence({}, () => observe())
    assert.deepEqual(overlap.evidence.observations[0].freshness_reasons, ['OVERLAPPING_ACTION'])
    const separate = await withEvidence({}, () => observe(ios))
    assert.equal(separate.evidence.observations[0].freshness, 'fresh')
    release(); await pending
    const superseded = await withEvidence({}, async () => { await observe(); tick(); await act() })
    assert.deepEqual(superseded.evidence.observations[0].freshness_reasons, ['SUPERSEDED_BY_ACTION'])
    const [one, two] = await Promise.all([act(), act(ios)])
    assert.notEqual(one.evidence.action_id, two.evidence.action_id)
    assert.equal(one.evidence.device?.platform, 'android')
    assert.equal(two.evidence.device?.platform, 'ios')

    const logs = await withEvidence({}, () => captureEvidence('logs', android, async () => ({ logs: [{ timestamp: null, message: 'untimed' }, { timestamp: 42 }, { timestamp: '2020-01-01T00:00:00Z' }] })))
    const log = logs.evidence.observations[0]
    assert.equal(log.freshness, 'unknown')
    assert.equal(log.earliest_entry_at_ms, 42)
    assert.equal(log.event_time_comparable, false)
    assert.equal(log.age_ms, null)
    const partial = await withEvidence({}, async () => {
      omitEvidence('logs'); omitEvidence('screenshot')
      await captureEvidence('ui_tree', android, async () => { throw new Error('offline') }).catch(() => null)
    })
    assert.deepEqual(partial.evidence.observations.map(v => v.status), ['omitted', 'omitted', 'failed'])
    assert.equal(partial.evidence.observations[0].freshness, 'not_applicable')
    assert.equal(partial.evidence.observations[2].error, 'offline')
    const unknown = await withEvidence({}, () => captureEvidence('screenshot', null, async () => ({})))
    assert.equal(unknown.evidence.observations[0].freshness, 'unknown')
    const reversal = await withEvidence({}, async () => {
      await observe(); wall -= 1000; mono += 10
    })
    assert.deepEqual(reversal.evidence.observations[0].freshness_reasons, ['CLOCK_DISCONTINUITY'])
    assert.equal(reversal.evidence.observations[0].age_ms, null)

    tick(600001)
    const expired = await withEvidence({ ref }, () => observe())
    assert.equal(expired.evidence.association_reason, 'ACTION_UNAVAILABLE')
    const first = await act()
    for (let i = 0; i < 1000; i++) await act()
    const evicted = await withEvidence({ ref: { sessionId: first.evidence.session_id, actionId: first.evidence.action_id! } }, () => observe())
    assert.equal(evicted.evidence.association_reason, 'ACTION_UNAVAILABLE')
    const noDispatch = await withEvidence({ action: true }, async () => undefined)
    assert.equal(noDispatch.evidence.dispatch_started_at_ms, null)
    assert.equal(noDispatch.evidence.verification_completed_at_ms, null)
    const multi = await withEvidence({ action: true }, async () => {
      await evidenceDispatch(android, async () => tick())
      tick()
      await evidenceDispatch(android, async () => tick())
    })
    assert.equal(multi.evidence.dispatch_completed_at_ms! - multi.evidence.dispatch_started_at_ms!, 30)
    for (const invalid of [null, [], {}, { sessionId: 'a', actionId: '' }, { sessionId: 'a', actionId: 'x'.repeat(129) }, { ...ref, extra: true }]) {
      assert.throws(() => validateActionRef(invalid), /INVALID_ARGUMENT/)
    }
    assert.deepEqual(validateActionRef(ref), ref)
  } finally {
    Date.now = originalWall
    if (originalMono) Object.defineProperty(performance, 'now', originalMono)
    else delete (performance as any).now
  }
  console.log('Correlated evidence clocks, freshness, references, isolation and bounds: PASS')
}
run().catch(error => { console.error(error); process.exit(1) })
