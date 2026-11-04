import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { IOSDebugNative } from '../../../src/debugger/ios.js'
import { DebuggerSessions, iosDebuggerSessions, debuggerSessions } from '../../../src/debugger/sessions.js'
import { iosCapabilities, iosLimitations } from '../../../src/debugger/ios-worker.js'
import { debuggerContracts, debuggerTools } from '../../../src/server/schemas/debugger-schema.js'
import { withDebuggerGuard, checkDebuggerGuard, pausedReadiness } from '../../../src/debugger/guard.js'
import { execCommandWithDiagnostics } from '../../../src/utils/ios/utils.js'
import { handleDebugger } from '../../../src/server/handlers/debugger-handlers.js'
import { DebuggerError, type WorkerEvent } from '../../../src/debugger/worker.js'
const directory = await mkdtemp(path.join(os.tmpdir(), 'ios-debugger-unit-'))
await writeFile(path.join(directory, 'App'), '')
const executable = await realpath(path.join(directory, 'App'))
const device = 'F9243BAF-62A8-4990-8A99-17F527F56FDA'
let processPath = executable, started = 'Mon Nov 4 12:00:00 2026', services = '123\t0\tUIKitApplication:dev.fixture.app[uuid]'
const calls: string[][] = []
const native = new IOSDebugNative(async (file, args) => {
  calls.push([file, ...args])
  if (args[0] === 'simctl' && args[1] === 'list') return JSON.stringify({ devices: { runtime: [{ udid: device, state: 'Booted' }] } })
  if (args.includes('get_app_container')) return directory
  if (file === '/usr/bin/plutil') return 'App'
  if (args.includes('launchctl')) return services
  if (args.includes('comm=')) return processPath
  if (args.includes('lstart=')) return started
  throw new Error('unexpected native command')
})
const base = { debugSessionId: 's', line: 1 }
for (const selector of [{}, { className: 'dev.App', sourceFile: '/tmp/App.swift' }, { sourceFile: 'App.swift' }]) {
  assert.equal(debuggerContracts.set_debugger_breakpoint.schema.safeParse({ ...base, ...selector }).success, false)
}
for (const selector of [{ className: 'dev.App' }, { sourceFile: '/tmp/App.swift' }]) {
  assert.equal(debuggerContracts.set_debugger_breakpoint.schema.safeParse({ ...base, ...selector }).success, true)
}
assert.ok(debuggerTools.find(t => t.name === 'attach_debugger')!.inputSchema.properties.platform)
let emit: (event: WorkerEvent) => void = () => {}
let closed = 0
const sessions = new DebuggerSessions(native, async onEvent => {
  emit = onEvent
  return { call: async (command, args) => {
    if (command === 'step' && args?.threadId === 'foreign') throw new DebuggerError('DEBUGGER_STALE_REFERENCE')
    if (command === 'attach') { assert.equal(args?.pid, 123); assert.equal(args?.executablePath, executable); emit({ event: 'stopped', stop_id: 'racing-stop', thread_id: 't' }) }
    return { breakpoints: [] }
  }, close: async () => { closed++ } }
}, async () => {}, { platform: 'ios', capabilities: iosCapabilities, limitations: iosLimitations })
const androidPause = debuggerSessions.paused, iosPause = iosDebuggerSessions.paused
try {
  const candidates = await native.candidates(device, 'dev.fixture.app')
  assert.equal(candidates[0].pid, 123); assert.equal(candidates[0].executable_path, executable)
  assert.equal(candidates[0].uid, null)
  await assert.rejects(native.candidates('booted', 'dev.fixture.app'), /INVALID_ARGUMENT/)
  await assert.rejects(native.candidates('00000000-0000-0000-0000-000000000000', 'dev.fixture.app'), /DEBUGGER_UNSUPPORTED/)
  processPath = '/tmp/foreign-process'
  await assert.rejects(native.identity(device, candidates[0]), /PROCESS_CHANGED/)
  processPath = executable; started = 'new process'
  await assert.rejects(native.identity(device, candidates[0]), /PROCESS_CHANGED/)
  started = candidates[0].start_identity
  services = '999\t0\tUIKitApplication:dev.fixture.other[uuid]'
  await assert.rejects(native.identity(device, candidates[0]), /PROCESS_CHANGED/)
  services = '123\t0\tUIKitApplication:dev.fixture.app[uuid]'
  const attached = await sessions.attach(device, 'dev.fixture.app')
  assert.equal(attached.device.platform, 'ios'); assert.equal(attached.state, 'paused', 'racing attach stop is preserved')
  assert.deepEqual(attached.cleanup.remaining_resources, ['lldb_worker'])
  await assert.rejects(sessions.command(attached.debug_session_id, 'set', { className: 'Wrong', line: 1 }), /INVALID_ARGUMENT/)
  emit({ event: 'stopped', stop_id: 'fresh', thread_id: 't' })
  await assert.rejects(sessions.command(attached.debug_session_id, 'step', { stopId: 'fresh', threadId: 'foreign', kind: 'into' }), /DEBUGGER_STALE_REFERENCE/)
  assert.equal(sessions.paused(device)?.stop?.stop_id, 'fresh', 'Rejected step preserves known suspension and guard')
  await assert.rejects(sessions.command(attached.debug_session_id, 'locals', { stopId: 'racing-stop' }), /DEBUGGER_STALE_REFERENCE/)
  iosDebuggerSessions.paused = id => id === 'same-id' ? { ...attached, debug_session_id: 'ios' } : null
  debuggerSessions.paused = id => id === 'same-id' ? { ...attached, debug_session_id: 'android' } : null
  assert.equal(pausedReadiness('same-id', 'ios')?.debug_session_id, 'ios')
  assert.equal(pausedReadiness('same-id', 'android')?.debug_session_id, 'android')
  await assert.rejects(withDebuggerGuard('ios', 'same-id', async () => checkDebuggerGuard(true)), /DEBUGGER_PAUSED/)
  await withDebuggerGuard('ios', 'other', async () => checkDebuggerGuard())
  await assert.rejects(withDebuggerGuard('ios', 'same-id', async () => execCommandWithDiagnostics(['simctl', 'launch', 'same-id', 'dev.fixture.app'])), /DEBUGGER_PAUSED/, 'Diagnostic fallback cannot resend a paused lifecycle command')
  assert.equal((await sessions.command(attached.debug_session_id, 'detach')).cleanup.status, 'complete')
  assert.equal(closed, 1)
  assert.ok(!calls.some(call => call.includes('forward')), 'iOS must not allocate or remove ADB forwards')
  const original = iosDebuggerSessions.capabilities
  try {
    iosDebuggerSessions.capabilities = async () => { throw new DebuggerError('DEBUGGER_UNSUPPORTED') }
    const response = await handleDebugger('get_debugger_capabilities', { platform: 'ios', deviceId: device, appId: 'dev.fixture.app' })
    const payload = JSON.parse(response.content[0].text)
    assert.equal(payload.device.platform, 'ios'); assert.equal(payload.capabilities.coroutines, false)
    assert.ok(!/JDK|Java worker|ADB/.test(payload.error.diagnostic.recovery))
  } finally { iosDebuggerSessions.capabilities = original }
  console.log('PASS iOS target membership, process identity, contracts, session routing, racing stops and platform guards')
} finally {
  debuggerSessions.paused = androidPause; iosDebuggerSessions.paused = iosPause
  await sessions.shutdown(); await rm(directory, { recursive: true, force: true })
}

// Confirmed detach and process-exit evidence are required for cleanup success.
const { IOSWorker } = await import('../../../src/debugger/ios-worker.js')
let transportClosed = 0
const disconnected = new IOSWorker({ call: async () => { throw new Error('transport lost') }, close: async () => { transportClosed++ } }, () => false)
await assert.rejects(disconnected.close(), /DEBUGGER_CLEANUP_FAILED/)
assert.equal(transportClosed, 1)
const exited = new IOSWorker({ call: async () => { throw new Error('must not need detach') }, close: async () => {} }, () => true)
await exited.close()
const confirmed = new IOSWorker({ call: async () => ({ detached: true }), close: async () => {} }, () => false)
await confirmed.close()
console.log('PASS iOS cleanup requires confirmed release; worker exit alone is insufficient')
