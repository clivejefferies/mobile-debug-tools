import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { InteractionDiagnostics } from '../../../src/server/handlers/interaction-diagnostics.js'
import { handleToolCall, toolDefinitions } from '../../../src/server-core.js'

let now = 0
const store = new InteractionDiagnostics(() => now)
const value = { error: 'original private diagnostic', evidence: { observations: [1, 2] } }
const ref = store.retain(value)
assert.equal(ref.available, true)
assert.deepEqual(store.lookup(ref.session_id, ref.result_id), { success: true, result: value })
value.error = 'mutated'
assert.notDeepEqual(store.lookup(ref.session_id, ref.result_id), { success: true, result: value })
now = 599999
assert.equal(store.lookup(ref.session_id, ref.result_id).success, true)
now++
assert.equal(store.lookup(ref.session_id, ref.result_id).error?.code, 'RESULT_UNAVAILABLE', 'reads do not extend expiry')
assert.equal(store.lookup(randomUUID(), ref.result_id).error?.code, 'SESSION_MISMATCH')
const oldest = store.retain({ n: 0 })
for (let n = 1; n <= 100; n++) store.retain({ n })
assert.equal(store.lookup(oldest.session_id, oldest.result_id).success, false)
const large = store.retain('a'.repeat(1024 * 1024))
assert.equal(large.available, false)
assert.equal(large.reason, 'RESULT_TOO_LARGE')
const byteStore = new InteractionDiagnostics()
const first = byteStore.retain('a'.repeat(1024 * 1024 - 100))
for (let n = 0; n < 16; n++) byteStore.retain('a'.repeat(1024 * 1024 - 100))
assert.equal(byteStore.lookup(first.session_id, first.result_id).success, false, 'total byte limit evicts before count limit')
const refs = await Promise.all(Array.from({ length: 30 }, async (_, n) => store.retain({ n })))
assert.equal(new Set(refs.map(r => r.result_id)).size, 30)
assert.ok(toolDefinitions.find(t => t.name === 'get_interaction_diagnostics')?.inputSchema.additionalProperties === false)
for (const args of [{}, { sessionId: randomUUID(), resultId: randomUUID(), extra: true }, { sessionId: 'bad', resultId: randomUUID() }]) {
  const response = await handleToolCall('get_interaction_diagnostics', args)
  assert.equal(JSON.parse(response.content[0].text!).error.code, 'INVALID_ARGUMENT')
}
console.log('PASS diagnostics fidelity, expiry, count/byte bounds, size rejection, session isolation and strict dispatch schema')

let expire: (() => void) | undefined
let cancelled = 0
const automatic = new InteractionDiagnostics(() => 0, randomUUID(), callback => { expire = callback; return () => { cancelled++ } })
const automaticRef = automatic.retain({ original: true })
assert(expire)
expire()
assert.equal(automatic.lookup(automaticRef.session_id, automaticRef.result_id).success, false, 'timer purges the payload without later cache access')
assert.equal(cancelled, 1)
