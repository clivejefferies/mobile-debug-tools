import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { diagnostic, stages, reasons, classify, parseDiagnostic } from '../../../src/debugger/diagnostics.js'
import { DebuggerError, JdiWorker, withDebuggerBudget, type WorkerEvent } from '../../../src/debugger/worker.js'
import { parseWorkerMessage } from '../../../src/debugger/protocol.js'
import { handleDebugger } from '../../../src/server/handlers/debugger-handlers.js'

const secret = 'PRIVATE_LOCALS_TOKEN_/private/path'
for (const stage of stages) for (const reason of reasons) {
  const value = diagnostic(stage, reason)
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 512)
  assert.ok(value.recovery.length <= 240 && /^[\x00-\x7f]*$/.test(value.recovery))
  assert.deepEqual(Object.keys(value), ['stage', 'reason', 'recovery'])
}
assert.deepEqual(parseDiagnostic({ stage: 'attach', reason: 'connection_refused', recovery: secret, raw: secret }), diagnostic('attach', 'connection_refused'))
assert.equal(classify(new Error(secret), 'attach', 'DEBUGGER_ATTACH_FAILED').diagnostic?.reason, 'unknown')
assert.equal(classify(new DebuggerError('DEBUGGER_STALE_REFERENCE'), 'command', 'DEBUGGER_WORKER_FAILED').diagnostic, undefined)
for (const hostile of [secret, { stage: secret, reason: 'unknown' }, { stage: 'attach', reason: secret }]) {
  assert.throws(() => parseWorkerMessage({ id: 1, error: { code: 'DEBUGGER_WORKER_FAILED', diagnostic: hostile } }), /INVALID_WORKER_DIAGNOSTIC/)
}
assert.throws(() => parseWorkerMessage({ id: 1, error: { code: secret } }), /INVALID_WORKER_ERROR/)
const cancelled = new AbortController(); cancelled.abort()
const response = await handleDebugger('get_debugger_state', { debugSessionId: 'absent' }, cancelled.signal)
assert.equal(response.isError, true)
const payload = JSON.parse(response.content[0].text)
assert.equal(payload.error.code, 'DEBUGGER_CANCELLED')
assert.deepEqual(payload.error.diagnostic, diagnostic('unknown', 'cancelled'))
assert.equal((await handleDebugger('get_debugger_state', {})).isError, true)

const directory = await mkdtemp(path.join(os.tmpdir(), 'debugger-diagnostics-test-'))
let index = 0
async function worker(body: string, onEvent: (event: WorkerEvent) => void = () => {}) {
  const file = path.join(directory, `worker-${index++}`)
  await writeFile(file, `#!${process.execPath}\n${body}\n`, { mode: 0o700 })
  return new JdiWorker(file, directory, onEvent)
}
async function fails(body: string, stage: string, reason: string) {
  const w = await worker(body)
  try {
    await assert.rejects(w.call('attach', {}, 3000), (error: unknown) => {
      assert.ok(error instanceof DebuggerError)
      assert.equal(error.code, 'DEBUGGER_WORKER_FAILED')
      assert.deepEqual(error.diagnostic, diagnostic(stage as typeof stages[number], reason as typeof reasons[number]))
      assert.ok(!JSON.stringify(error).includes(secret))
      return true
    })
  } finally { await w.close() }
}
try {
  const missing = new JdiWorker(path.join(directory, 'missing'), directory, () => {})
  try { await assert.rejects(missing.call('attach'), (e: unknown) => e instanceof DebuggerError && e.diagnostic?.reason === 'spawn_failed') } finally { await missing.close() }
  await fails(`process.stderr.write(${JSON.stringify(secret)}); process.exit(7)`, 'worker_start', 'process_exited')
  await fails(`process.stdout.write(${JSON.stringify(secret + '\n')}); setInterval(()=>{},1000)`, 'ipc', 'invalid_message')
  await fails(`process.stdout.write('x'.repeat(1048577)+'\\n'); setInterval(()=>{},1000)`, 'ipc', 'message_limit')
  const attach = await worker(`process.stdin.once('data', data => { const {id}=JSON.parse(data); console.log(JSON.stringify({id,error:{code:'DEBUGGER_WORKER_FAILED',diagnostic:{stage:'attach',reason:'connection_refused',raw:${JSON.stringify(secret)}}}})) })`)
  try { await assert.rejects(attach.call('attach'), (e: unknown) => e instanceof DebuggerError && e.diagnostic?.reason === 'connection_refused') } finally { await attach.close() }
  let ready = () => {}
  const readyPromise = new Promise<void>(resolve => { ready = resolve })
  const brokenPipe = await worker(`require('node:fs').closeSync(0); console.log(JSON.stringify({event:'ready'})); setInterval(()=>{},1000)`, () => ready())
  try {
    await readyPromise
    await assert.rejects(brokenPipe.call('state'), (e: unknown) => e instanceof DebuggerError && e.diagnostic?.reason === 'write_failed')
  } finally { await brokenPipe.close() }
  const afterReply = await worker(`process.stdin.once('data',data=>{const {id}=JSON.parse(data); console.log(JSON.stringify({id,result:{}})); setTimeout(()=>process.exit(7),100)})`)
  try {
    await afterReply.call('state')
    await assert.rejects(afterReply.call('state'), (e: unknown) => e instanceof DebuggerError && e.diagnostic?.stage === 'ipc' && e.diagnostic.reason === 'process_exited')
  } finally { await afterReply.close() }
  const idle = await worker('process.stdin.resume()')
  try {
    await assert.rejects(idle.call('stack', {}, 50), (e: unknown) => e instanceof DebuggerError && e.diagnostic?.stage === 'command' && e.diagnostic.reason === 'timeout')
    const controller = new AbortController()
    const call = withDebuggerBudget(1000, controller.signal, () => idle.call('attach'))
    controller.abort()
    await assert.rejects(call, (e: unknown) => e instanceof DebuggerError && e.diagnostic?.stage === 'attach' && e.diagnostic.reason === 'cancelled')
  } finally { await idle.close() }
} finally { await rm(directory, { recursive: true, force: true }) }
console.log('PASS diagnostic bounds/privacy, strict IPC, real worker spawn/exit/malformed/oversize, attach failure, timeout/cancel and MCP wrapping')
