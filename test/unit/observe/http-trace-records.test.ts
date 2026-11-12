import assert from 'node:assert/strict'
import { TraceBuffer } from '../../../src/observe/http-trace/records.js'

const trace = new TraceBuffer('session')
assert.equal(trace.read(undefined, 1).readiness, 'listening')
trace.append({ method: 'GET', host: 'test.local', capturedAt: 0, elapsedMs: 1, status: 200 })
const first = trace.read(undefined, 1)
for (let capturedAt = 1; capturedAt <= 260; capturedAt++) {
  trace.append({ method: 'GET', host: 'test.local', capturedAt, elapsedMs: 1, failure: 'upstream_transport' })
}
const next = trace.read(first.nextCursor, 2)
assert.equal(next.evicted, 4)
assert.deepEqual(next.records.map(record => record.capturedAt), [5, 6])
assert.equal(next.readiness, 'exchange_observed')
assert.equal(trace.read(next.nextCursor, 1).records[0].capturedAt, 7)
assert.throws(() => new TraceBuffer('other').read(first.nextCursor, 1), /HTTP_TRACE_INVALID_CURSOR/)
trace.clear()
assert.deepEqual(trace.read(undefined, 1).records, [])
assert.equal(trace.read(undefined, 1).readiness, 'listening')
console.log('HTTP trace record paging, eviction, readiness and cursor scoping: PASS')
