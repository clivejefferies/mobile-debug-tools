import assert from 'node:assert/strict'
import { AndroidTraceNative } from '../../../src/observe/system-trace-android.js'
import type { execCmd } from '../../../src/utils/exec.js'

async function run() {
  const calls: Array<{ args: string[]; timeout: number | undefined }> = []
  let failure = '', processes = ''
  const execute: typeof execCmd = async (_cmd, args, options = {}) => {
    calls.push({ args, timeout: options.timeout })
    assert.equal(args[0], '-s'); assert.equal(args[1], 'serial with spaces')
    if (failure && args.join(' ').includes(failure)) return { exitCode: null, stdout: '', stderr: 'ACTION_TIMEOUT' }
    let out = ''
    if (args.includes('--help')) return { exitCode: 1, stdout: '', stderr: 'Usage: perfetto --background-wait --config' }
    if (args.includes('getprop')) out = '36'
    if (args.includes('--list_categories')) out = ' sched - Scheduling\n input - Input\n gfx - Graphics'
    if (args.join(' ').includes('YQ==')) out = 'a'
    if (args.join(' ').includes('for pid')) out = processes
    if (args.includes('stat')) out = '1024'
    return { exitCode: 0, stdout: out, stderr: '' }
  }
  const native = new AndroidTraceNative(execute)
  const remote = '/data/misc/perfetto-traces/mcp-62a51510-c303-4a1b-af0e-f97cc976d740.perfetto-trace'
  assert.equal((await native.capabilities('serial with spaces')).supported, true)
  for (const probe of ['--help', '--query', 'getprop', '--list_categories', 'test -w', 'YQ==']) {
    failure = probe
    assert.equal((await native.capabilities('serial with spaces')).supported, false, probe)
  }
  failure = ''
  await native.start('serial with spaces', remote, 1001, ['sched', 'input'])
  assert.equal(calls.at(-1)!.timeout, 35000)
  assert.ok(calls.at(-1)!.args.join(' ').includes('--background-wait -c -'))
  assert.equal(await native.find('serial with spaces', remote), null)
  processes = '123 456'
  assert.deepEqual(await native.find('serial with spaces', remote), { pid: 123, startTime: '456' })
  assert.ok(calls.at(-1)!.args.join(' ').includes('stat=$(cat "$p/stat" 2>/dev/null) || { [ ! -d "$p" ] && continue; exit 1; }'), 'Unreadable process identity must fail closed')
  processes = '123 456\n999 888'
  await assert.rejects(() => native.find('serial with spaces', remote), /IDENTITY_UNAVAILABLE/)
  const previous = calls.length
  await assert.rejects(() => native.stop('serial with spaces', remote, { pid: 0, startTime: '4' }))
  await assert.rejects(() => native.start('serial with spaces', '/tmp/other; killall perfetto', 1000, []))
  assert.equal(calls.length, previous)
  await native.stop('serial with spaces', remote, { pid: 123, startTime: '456' })
  const signal = calls.at(-1)!.args.join(' ')
  assert.ok(signal.indexOf('awk') < signal.indexOf('kill -TERM'))
  assert.ok(signal.indexOf('grep -Fx') < signal.indexOf('kill -TERM'))
  assert.ok(!signal.includes('killall'))
  failure = 'pull'
  await assert.rejects(() => native.pull('serial with spaces', remote, '/tmp/fixture'), /ACTION_TIMEOUT/)
  assert.equal(calls.at(-1)!.timeout, 30000)
  console.log('Android Perfetto adapter probes, targeting, guards and deadlines: PASS')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
