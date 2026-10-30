import assert from 'node:assert/strict'
import { DebuggerSessions, debuggerExpiry } from '../../../src/debugger/sessions.js'
import { DebuggerError, type WorkerEvent } from '../../../src/debugger/worker.js'
import type { DebugNative, DebugTarget } from '../../../src/debugger/android.js'
import { debuggerContracts, debuggerTools } from '../../../src/server/debugger-schema.js'
assert.equal(debuggerExpiry(0, 0, 0, 59999), null)
assert.equal(debuggerExpiry(0, 60000, 0, 60000), 'pause_limit', 'polling cannot extend pause expiry')
assert.equal(debuggerExpiry(0, 0, undefined, 300000), 'idle_limit')
assert.equal(debuggerExpiry(0, 1800000, undefined, 1800000), 'session_limit', 'activity cannot extend lifetime')
const target: DebugTarget = { app_id: 'test.app', pid: 123, uid: 456, process_name: 'test.app', start_identity: '100' }
let candidates = [target]
let removed = 0
let emit: (event: WorkerEvent) => void = () => {}
let close = 0
let failCleanup = false
let failCommand = ''
const native: DebugNative = {
  candidates: async () => candidates, identity: async () => target, forward: async () => 12345,
  removeForward: async () => { if (failCleanup) throw new Error('offline'); removed++ }
}
const sessions = new DebuggerSessions(native, async event => {
  emit = event
  return { call: async (command: string) => { if (command === failCommand) throw new DebuggerError('DEBUGGER_TIMEOUT'); return { state: 'running', breakpoints: [] } }, close: async () => { close++ } }
}, async () => ({ java: 'java', directory: '/unused' }))
try {
  candidates = [target, { ...target, pid: 124 }]
  const ambiguous = await sessions.attach('emulator', 'test.app')
  assert.equal(ambiguous.error.code, 'PROCESS_AMBIGUOUS')
  assert.equal(removed, 0)
  candidates = [target]
  const first = await sessions.attach('emulator', 'test.app')
  const id = first.debug_session_id
  assert.equal(first.state, 'running')
  await assert.rejects(sessions.attach('emulator', 'test.app'), /DEBUGGER_BUSY/)
  emit({ event: 'stopped', stop_id: 'stop-1', thread_id: 't1', stops: [] })
  assert.equal(sessions.paused('emulator')?.stop.stop_id, 'stop-1')
  assert.equal(sessions.paused('other'), null)
  assert.throws(() => sessions.assertRunning('emulator'), /DEBUGGER_PAUSED/)
  const pendingWait = sessions.command(id, 'events', { afterSequence: 1 }, 500)
  await sessions.command(id, 'resume', { stopId: 'stop-1' })
  assert.equal(sessions.paused('emulator'), null)
  await assert.rejects(sessions.command(id, 'locals', { stopId: 'stop-1', frameId: 'old' }), /DEBUGGER_STALE_REFERENCE/)
  emit({ event: 'stopped', stop_id: 'stop-2', thread_id: 't2' })
  assert.equal((await pendingWait).events[0].stop_id, 'stop-2', 'event wait cannot block resume')
  for (let i = 0; i < 260; i++) emit({ event: 'breakpoint', i })
  const events = await sessions.command(id, 'events', { afterSequence: 0 }, 100)
  assert.equal(events.overflow, true); assert.equal(events.events.length, 100)
  await assert.rejects(sessions.command(id, 'events', { afterSequence: 9999 }, 100), /INVALID_ARGUMENT/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(sessions.command(id, 'events', { afterSequence: 262, signal: controller.signal }, 100), /DEBUGGER_CANCELLED/)
  failCommand = 'locals'
  await assert.rejects(sessions.command(id, 'locals', { stopId: 'stop-2' }, 100), /DEBUGGER_TIMEOUT/)
  assert.equal(sessions.paused('emulator')?.state, 'paused', 'inspection timeout preserves known suspension')
  failCommand = 'step'
  await assert.rejects(sessions.command(id, 'step', { stopId: 'stop-2', threadId: 't2' }, 100), /DEBUGGER_TIMEOUT/)
  assert.equal((await sessions.command(id, 'state')).cleanup.status, 'complete')
  assert.equal(close, 1); assert.equal(removed, 1)
  failCommand = ''
  const second = await sessions.attach('emulator', 'test.app')
  failCleanup = true
  const partial = await sessions.command(second.debug_session_id, 'detach')
  assert.equal(partial.success, false); assert.equal(partial.cleanup.status, 'failed')
  await assert.rejects(sessions.attach('emulator', 'test.app'), /DEBUGGER_BUSY/)
  failCleanup = false
  const retry = await sessions.command(second.debug_session_id, 'detach')
  assert.equal(retry.cleanup.status, 'complete'); assert.equal(close, 2)
  assert.equal((await sessions.command(second.debug_session_id, 'detach')).cleanup.status, 'complete')
  const third = await sessions.attach('emulator', 'test.app')
  emit({ event: 'worker_failed' })
  const crashed = await sessions.command(third.debug_session_id, 'state')
  assert.equal(crashed.state, 'failed')
  assert.equal(crashed.cleanup.status, 'complete')
  assert.equal(crashed.error.code, 'DEBUGGER_WORKER_FAILED')
  assert.equal(sessions.paused('emulator'), null)
  for (const tool of debuggerTools) {
    const contract = debuggerContracts[tool.name]
    assert.equal(tool.inputSchema.additionalProperties, false)
    assert.equal(contract.schema.safeParse({ ...Object.fromEntries(tool.inputSchema.required.map(k => [k, 'x'])), unexpected: true }).success, false)
  }
  assert.equal(debuggerContracts.attach_debugger.schema.safeParse({ platform: 'android', appId: 'test.app' }).success, false)
  assert.equal(debuggerContracts.set_debugger_breakpoint.schema.safeParse({ debugSessionId: 's', className: '$(bad)', line: 2 }).success, false)
  console.log('PASS debugger session ownership, stop epochs, event concurrency/overflow, timeout recovery, cleanup retries, strict contracts')
} finally { await sessions.shutdown() }
