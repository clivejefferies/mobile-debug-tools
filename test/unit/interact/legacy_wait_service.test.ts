import assert from 'node:assert/strict'
import { waitForUICore } from '../../../src/interact/waits/legacy-wait.js'
import type { LegacyWaitDependencies } from '../../../src/interact/waits/legacy-wait-state.js'

const calls: string[] = []
const deps: LegacyWaitDependencies = {
  fingerprint: async () => { calls.push('fingerprint'); return { fingerprint: 'initial' } },
  logs: async () => { calls.push('logs'); return { logs: ['before'] } },
  stream: async () => { calls.push('stream'); return { entries: [{ message: 'operation done' }] } },
  find: async () => { throw new Error('log waits must not search UI elements') },
  snapshot: async () => { throw new Error('successful waits must not collect failure snapshots') }
}
const result = await waitForUICore({ type: 'log', query: 'done', timeoutMs: 1000 }, deps)
assert.equal(result.success, true)
assert.equal(result.observed_state, true)
assert.deepEqual(calls, ['fingerprint', 'logs', 'stream'])
console.log('PASS injected legacy wait: baseline collection, stream-first matching and no failure snapshot')
