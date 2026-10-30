import assert from 'node:assert/strict'
import { AndroidDebugNative } from '../../../src/debugger/android.js'
import { DebuggerError, debuggerRemaining, withDebuggerBudget } from '../../../src/debugger/worker.js'
class Native extends AndroidDebugNative {
  calls: string[][] = []
  forwards = 'device tcp:1234 jdwp:10\nother tcp:3456 jdwp:20'
  async adb(_device: string, args: string[]) {
    this.calls.push(args)
    if (args[0] === 'forward' && args[1] === '--list') return this.forwards
    if (args.at(-1)?.endsWith('/stat')) return '10 (complex process name) S ' + Array(18).fill('0').join(' ') + ' 999 0'
    if (args.at(-1)?.endsWith('/status')) return 'Name:\ttest\nUid:\t42\t42\t42\t42'
    if (args.at(-1)?.endsWith('/cmdline')) return 'test.app\0'
    return ''
  }
}
const native = new Native()
await native.removeForward('device', 1234, 10)
assert.deepEqual(native.calls.at(-1), ['forward', '--remove', 'tcp:1234'])
await assert.rejects(native.removeForward('device', 3456, 10), /DEBUGGER_CLEANUP_FAILED/)
const before = native.calls.length
await native.removeForward('device', 9999, 10)
assert.equal(native.calls.length, before + 1, 'absent owned forward requires no removal')
const target = { app_id: 'test.app', pid: 10, process_name: 'test.app', start_identity: '', uid: 42 }
assert.equal((await native.identity('device', target)).start_identity, '999')
await assert.rejects(native.identity('device', { ...target, start_identity: 'old' }), /PROCESS_CHANGED/)
await assert.rejects(native.identity('device', { ...target, uid: 44 }), /PROCESS_CHANGED/)
await assert.rejects(native.candidates('device', 'test.app;evil'), /INVALID_ARGUMENT/)
const aborted = new AbortController(); aborted.abort()
await assert.rejects(withDebuggerBudget(100, aborted.signal, async () => debuggerRemaining(10)), /DEBUGGER_CANCELLED/)
await assert.rejects(withDebuggerBudget(-1, undefined, async () => debuggerRemaining(10)), /DEBUGGER_TIMEOUT/)
assert.equal(await withDebuggerBudget(100, undefined, async () => debuggerRemaining(10)), 10)
assert.equal(new DebuggerError('DEBUGGER_TIMEOUT').code, 'DEBUGGER_TIMEOUT')
console.log('PASS debugger native identity, PID reuse, forward ownership, deadlines and cancellation')
