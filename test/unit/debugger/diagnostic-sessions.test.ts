import assert from 'node:assert/strict'
import { DebuggerSessions } from '../../../src/debugger/sessions.js'
import type { DebugNative, DebugTarget } from '../../../src/debugger/android.js'
import { DebuggerError, type WorkerEvent } from '../../../src/debugger/worker.js'
import { diagnostic } from '../../../src/debugger/diagnostics.js'
const target: DebugTarget = { app_id: 'test.app', process_name: 'test.app', pid: 1, uid: 2, start_identity: '3' }
let removed = 0
let closed = 0
let cleanupFails = false
let mode = ''
const callbacks = new Map<string, (event: WorkerEvent) => void>()
const native: DebugNative = {
  candidates: async () => [target], identity: async () => target, forward: async () => 12345,
  removeForward: async () => { if (cleanupFails) throw new Error('private'); removed++ }
}
const sessions = new DebuggerSessions(native, async emit => {
  callbacks.set(mode, emit)
  return {
    call: async command => {
      if (command === 'attach' && mode === 'attach') throw new DebuggerError('DEBUGGER_WORKER_FAILED', diagnostic('attach', 'connection_refused'))
      if (command === 'step') {
        emit({ event: 'worker_failed', diagnostic: diagnostic('ipc', 'invalid_message') })
        throw new DebuggerError('DEBUGGER_WORKER_FAILED', diagnostic('ipc', 'invalid_message'))
      }
      return {}
    },
    close: async () => { closed++ }
  }
}, async () => ({ java: 'unused', directory: 'unused' }))
try {
  mode = 'attach'
  const failed = await sessions.attach('one', 'test.app')
  assert.equal(failed.error.code, 'DEBUGGER_WORKER_FAILED')
  assert.deepEqual(failed.error.diagnostic, diagnostic('attach', 'connection_refused'))
  assert.equal(failed.cleanup.status, 'complete')
  assert.equal(closed, 1); assert.equal(removed, 1)
  mode = 'first'
  const first = await sessions.attach('one', 'test.app')
  mode = 'second'
  const second = await sessions.attach('two', 'test.app')
  callbacks.get('first')!({ event: 'stopped', stop_id: 'stop' })
  await assert.rejects(sessions.command(first.debug_session_id, 'step', { stopId: 'stop' }), /DEBUGGER_WORKER_FAILED/)
  const terminal = await sessions.command(first.debug_session_id, 'state')
  assert.deepEqual(terminal.error.diagnostic, diagnostic('ipc', 'invalid_message'), 'event/rejection race retains primary evidence after cleanup')
  assert.equal(terminal.cleanup.status, 'complete')
  await assert.rejects(sessions.command(first.debug_session_id, 'stack', {}), (e: unknown) => e instanceof DebuggerError && e.code === 'DEBUGGER_DISCONNECTED' && e.diagnostic?.reason === 'invalid_message')
  assert.equal((await sessions.command(second.debug_session_id, 'state')).success, true, 'other device is isolated')
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(sessions.command(second.debug_session_id, 'events', { signal: aborted.signal }), (e: unknown) => e instanceof DebuggerError && e.diagnostic?.stage === 'command' && e.diagnostic.reason === 'cancelled')
  cleanupFails = true
  const incomplete = await sessions.command(second.debug_session_id, 'detach')
  assert.equal(incomplete.error.code, 'DEBUGGER_CLEANUP_FAILED')
  assert.deepEqual(incomplete.error.diagnostic, diagnostic('cleanup', 'operation_failed'))
  cleanupFails = false
  assert.equal((await sessions.command(second.debug_session_id, 'detach')).cleanup.status, 'complete')
  mode = 'shutdown'
  const shutdown = await sessions.attach('three', 'test.app')
  await sessions.shutdown()
  assert.equal(sessions.summary(shutdown.debug_session_id).cleanup.status, 'complete')
} finally { await sessions.shutdown() }
const badProbes = new DebuggerSessions({ ...native, candidates: async () => { throw new Error('private-token') } }, undefined,
  async () => { throw new DebuggerError('DEBUGGER_UNSUPPORTED', diagnostic('compilation', 'operation_failed')) })
const probe = await badProbes.capabilities('one', 'test.app')
assert.equal(probe.success, true); assert.equal(probe.supported, false)
assert.deepEqual(probe.diagnostics, [diagnostic('compilation', 'operation_failed'), diagnostic('target_resolution', 'unknown')])
assert.ok(!JSON.stringify(probe).includes('private-token'))
console.log('PASS diagnostic session retention/races, cleanup retry, isolation, shutdown and ordered capability diagnostics')
