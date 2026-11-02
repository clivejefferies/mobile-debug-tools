import assert from 'node:assert/strict'
import { debuggerResponse } from '../../../src/server/handlers/debugger-response.js'
import { handleDebugger } from '../../../src/server/handlers/debugger-handlers.js'
import { debuggerContracts, debuggerTools } from '../../../src/server/schemas/debugger-schema.js'
import { debuggerSessions } from '../../../src/debugger/sessions.js'
import { DebuggerError } from '../../../src/debugger/worker.js'
import { diagnostic } from '../../../src/debugger/diagnostics.js'

const baseline = ['capabilities', 'attach', 'state']
const payload = {
  success: false, debug_session_id: 'session', device: { id: 'device' }, target: { pid: 42 }, capabilities: { locals: true },
  state: 'paused', captured_at_ms: 123, reason: null, stop: { stop_id: 'stop', thread_id: 'thread' },
  limitations: ['SHALLOW_LOCALS'], cleanup: { status: 'failed', remaining_resources: ['forward:tcp:123'] },
  error: { code: 'DEBUGGER_CLEANUP_FAILED', retryable: false, diagnostic: diagnostic('cleanup', 'operation_failed') },
  execution_state: 'unknown', result: { frames: [{ frame_id: 'frame' }], truncated: true, availability: 'unknown' },
  breakpoints: [], events: [], next_cursor: 4, overflow: true, timed_out: false, future_field: { preserve: true }
}
const expected = structuredClone(payload) as Record<string, unknown>
for (const key of ['device', 'target', 'capabilities']) delete expected[key]
const before = structuredClone(payload)
for (const tool of debuggerTools) {
  const contract = debuggerContracts[tool.name]
  assert.deepEqual(tool.inputSchema.properties.responseMode, { type: 'string', enum: ['compact', 'debug'], default: 'debug' })
  const shape = contract.schema.shape
  assert.equal(shape.responseMode.parse(undefined), 'debug')
  for (const mode of ['compact', 'debug']) assert.equal(shape.responseMode.parse(mode), mode)
  assert.equal(shape.responseMode.safeParse('full').success, false)
  assert.deepEqual(debuggerResponse(contract.command, 'debug', payload), payload)
  assert.deepEqual(debuggerResponse(contract.command, 'compact', payload), baseline.includes(contract.command) ? payload : expected)
  const success = { ...payload, success: true, error: undefined, cleanup: { status: 'pending', remaining_resources: ['jdi_worker'] } }
  assert.deepEqual(debuggerResponse(contract.command, 'compact', success), baseline.includes(contract.command) ? success : { ...expected, success: true, error: undefined, cleanup: success.cleanup })
  const noSession = { ...payload, debug_session_id: null }
  assert.deepEqual(debuggerResponse(contract.command, 'compact', noSession), noSession)
}
assert.deepEqual(payload, before, 'projection must not mutate nested or shared objects')

// This self-running test has its own process; restore the singleton seam in finally.
const original = debuggerSessions.command
try {
  debuggerSessions.command = async (_id, _command, args) => {
    assert.ok(!Object.hasOwn(args!, 'responseMode'), 'presentation input must not reach worker')
    return { ...payload, success: true } as unknown as Awaited<ReturnType<typeof original>>
  }
  for (const mode of [undefined, 'debug', 'compact']) {
    const response = await handleDebugger('get_debugger_locals', { debugSessionId: 'session', stopId: 'stop', frameId: 'frame', ...(mode ? { responseMode: mode } : {}) })
    assert.equal(response.isError, undefined)
    assert.deepEqual(JSON.parse(response.content[0].text), { ...(mode === 'compact' ? expected : payload), success: true })
  }
  for (const code of ['DEBUGGER_STALE_REFERENCE', 'DEBUGGER_NOT_FOUND', 'DEBUGGER_WORKER_FAILED', 'DEBUGGER_TIMEOUT', 'DEBUGGER_CANCELLED']) {
    debuggerSessions.command = async () => { throw new DebuggerError(code, diagnostic('command', 'unknown')) }
    for (const responseMode of ['compact', 'debug']) {
      const response = await handleDebugger('resume_debugger', { debugSessionId: 'absent', stopId: 'old', responseMode })
      const value = JSON.parse(response.content[0].text)
      assert.equal(response.isError, true)
      assert.equal(value.error.code, code)
      assert.equal(Object.hasOwn(value, 'capabilities'), responseMode === 'debug')
      assert.equal(value.debug_session_id, 'absent')
    }
  }
  const invalid = await handleDebugger('detach_debugger', { debugSessionId: 'session', responseMode: 'full' })
  assert.equal(JSON.parse(invalid.content[0].text).error.code, 'INVALID_ARGUMENT')
} finally { debuggerSessions.command = original }
console.log('PASS debugger response defaults, exact retention, failures, immutable projection and argument isolation')
