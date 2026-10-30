import assert from 'node:assert/strict'
import { parseWorkerMessage } from '../../../src/debugger/protocol.js'

const event = { event: 'stopped', stop_id: 'stop-1', thread_id: 'thread-1', stops: [] }
assert.deepEqual(parseWorkerMessage(event), { kind: 'event', value: event })
assert.deepEqual(parseWorkerMessage({ id: 1, result: { locals: [] } }), { kind: 'reply', id: 1, result: { locals: [] } })
assert.deepEqual(parseWorkerMessage({ id: 2, error: { code: 'DEBUGGER_STALE_REFERENCE' } }), {
  kind: 'reply', id: 2, result: {}, error: { code: 'DEBUGGER_STALE_REFERENCE' }
})
for (const invalid of [null, [], { event: 42 }, { event: 'stopped', stop_id: 42 },
  { id: '1', result: {} }, { id: -1, result: {} }, { id: 1.2, result: {} },
  { id: 1, result: 'private-debuggee-value' }, { id: 1, error: { code: 42 } }]) {
  assert.throws(() => parseWorkerMessage(invalid), /^Error: INVALID_WORKER_/, 'malformed worker input is rejected without exposing its contents')
}
console.log('PASS validated worker events/replies and content-free protocol errors')
