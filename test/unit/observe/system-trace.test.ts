import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { SystemTraceSessions, type TraceClock } from '../../../src/observe/system-trace.js'
import { TRACE_MAX_BYTES, traceConfig, type TraceNative, type TraceCapabilities, type TraceProcess } from '../../../src/observe/system-trace-android.js'

function fixture() {
  let now = 1000000
  let failStart = '', failStop = '', failPull = '', failRemove = '', failFind = ''
  let supported = true, empty = false, oversized = false, stuck = false
  let starts = 0, stops = 0, pulls = 0, removes = 0
  const processes = new Map<string, TraceProcess>()
  const pending = new Map<any, () => void>()
  const time: TraceClock = { wall: () => now, mono: () => now, sleep: async ms => { now += ms },
    schedule(fn) { const id = {} as any; pending.set(id, fn); return id }, clear: id => { pending.delete(id) } }
  const native: TraceNative = {
    async capabilities(device) { return { supported, backend: 'perfetto', device: { platform: 'android', id: device }, prerequisites: {}, reasons: [], enabled_sources: ['sched', 'input'], unavailable_categories: [], limitations: [] } as TraceCapabilities },
    async start(_d, remote) { starts++; processes.set(remote, { pid: starts + 100, startTime: String(starts) }); if (failStart) throw new Error(failStart) },
    async find(_d, remote) { if (failFind) throw new Error(failFind); return processes.get(remote) ?? null },
    async stop(_d, remote) { stops++; if (failStop) throw new Error(failStop); if (!stuck) processes.delete(remote) },
    async pull(_d, _r, local) { pulls++; await fs.writeFile(local, empty ? '' : 'perfetto-fixture'); if (oversized) await fs.truncate(local, TRACE_MAX_BYTES + 1); if (failPull) throw new Error(failPull) },
    async remove() { removes++; if (failRemove) throw new Error(failRemove) }
  }
  const sessions = new SystemTraceSessions(native, time)
  const files: string[] = []
  return { sessions, native, time, processes, pending, files,
    tick(ms: number) { now += ms }, get counts() { return { starts, stops, pulls, removes } },
    flags(v: { start?: string; stop?: string; pull?: string; remove?: string; find?: string; supported?: boolean; empty?: boolean; oversized?: boolean; stuck?: boolean }) {
      failStart = v.start ?? ''; failStop = v.stop ?? ''; failPull = v.pull ?? ''; failRemove = v.remove ?? ''; failFind = v.find ?? ''
      supported = v.supported ?? true; empty = v.empty ?? false; oversized = v.oversized ?? false; stuck = v.stuck ?? false
    },
    async cleanup() { await sessions.shutdown(); await Promise.all(files.map(file => fs.rm(path.dirname(file), { recursive: true, force: true }))) }
  }
}
async function run() {
  const f = fixture()
  try {
    const a = await f.sessions.start('a', 1001)
    assert.equal(a.state, 'recording')
    assert.equal(a.capture_completed_at_ms, null)
    await assert.rejects(() => f.sessions.start('a'), /TRACE_BUSY/)
    const b = await f.sessions.start('b')
    const end = await f.sessions.link(a.trace_id, { platform: 'android', id: 'a' }, 'journey-a')
    await assert.rejects(() => f.sessions.link(a.trace_id, { platform: 'android', id: 'b' }, 'wrong'), /TRACE_NOT_FOUND/)
    await assert.rejects(() => f.sessions.link(a.trace_id, { platform: 'ios', id: 'a' }, 'wrong'), /TRACE_NOT_FOUND/)
    const [stop, again] = await Promise.all([f.sessions.control(a.trace_id, 'stop'), f.sessions.control(a.trace_id, 'stop')])
    assert.equal(stop.state, 'completed'); assert.deepEqual(stop, again)
    f.files.push(stop.artifact!.path)
    assert.equal((await end()).coverage, 'partial') // another call stopped capture during the linked journey
    assert.deepEqual(stop.correlation_ids, ['journey-a'])
    assert.equal((await fs.stat(stop.artifact!.path)).mode & 0o777, 0o600)
    assert.equal((await f.sessions.control(a.trace_id, 'cancel')).artifact?.path, stop.artifact?.path)
    assert.equal(f.counts.pulls, 1)
    assert.equal((await f.sessions.control(b.trace_id, 'cancel')).state, 'cancelled')
    assert.equal(f.counts.pulls, 1)
    const expired = await f.sessions.start('c', 1000)
    f.tick(1001)
    const duration = await f.sessions.control(expired.trace_id, 'status')
    assert.equal(duration.completion_reason, 'duration_limit'); f.files.push(duration.artifact!.path)
    f.tick(600001)
    await assert.rejects(() => f.sessions.control(a.trace_id, 'status'), /TRACE_NOT_FOUND/)
    await assert.rejects(() => f.sessions.control('previous-server', 'stop'), /TRACE_NOT_FOUND/)
  } finally { await f.cleanup() }

  for (const failure of ['start', 'stop', 'pull', 'remove', 'find', 'empty', 'oversized'] as const) {
    const f = fixture()
    try {
      if (failure === 'start') f.flags({ start: 'ACTION_TIMEOUT' })
      const a = await f.sessions.start('a')
      if (failure === 'start') {
        assert.equal(a.reason, 'ACTION_TIMEOUT'); assert.equal(a.state, 'failed'); assert.equal(a.cleanup.status, 'complete')
        assert.equal(f.processes.size, 0); continue
      }
      f.flags(failure === 'empty' || failure === 'oversized' ? { [failure]: true } : { [failure]: 'ACTION_TIMEOUT' })
      const stop = await f.sessions.control(a.trace_id, 'stop')
      assert.equal(stop.state, 'failed', failure); assert.equal(stop.cleanup.status, 'failed', failure)
      if (stop.artifact) f.files.push(stop.artifact.path)
      if (failure === 'pull' || failure === 'empty' || failure === 'oversized') assert.equal(stop.artifact, null)
      f.flags({})
      const retry = await f.sessions.control(a.trace_id, 'stop')
      assert.equal(retry.state, 'completed', failure); assert.equal(retry.cleanup.status, 'complete')
      if (!f.files.includes(retry.artifact!.path)) f.files.push(retry.artifact!.path)
    } finally { await f.cleanup() }
  }
  const reuse = fixture()
  try {
    const a = await reuse.sessions.start('a')
    const [remote, process] = [...reuse.processes.entries()][0]
    reuse.processes.set(remote, { ...process, startTime: '999999' })
    const result = await reuse.sessions.control(a.trace_id, 'stop')
    assert.equal(result.reason, 'TRACE_STOP_FAILED'); assert.equal(reuse.counts.stops, 0)
    reuse.processes.delete(remote)
    assert.equal((await reuse.sessions.control(a.trace_id, 'cancel')).state, 'cancelled')
  } finally { await reuse.cleanup() }
  const cap = fixture()
  try {
    cap.flags({ supported: false })
    assert.equal((await cap.sessions.start('a')).reason, 'TRACE_UNSUPPORTED'); assert.equal(cap.counts.starts, 0)
    cap.flags({})
    await Promise.all(['a', 'b', 'c', 'd'].map(d => cap.sessions.start(d)))
    await assert.rejects(() => cap.sessions.start('e'), /TRACE_BUSY/)
    await cap.sessions.shutdown(); assert.equal(cap.processes.size, 0)
    await assert.rejects(() => cap.sessions.start('e'), /TRACE_BUSY/)
  } finally { await cap.cleanup() }
  const timer = fixture()
  try {
    const a = await timer.sessions.start('timer', 1000)
    timer.tick(1000)
    for (const callback of timer.pending.values()) callback()
    const ended = await timer.sessions.control(a.trace_id, 'status')
    assert.equal(ended.state, 'completed'); assert.equal(ended.completion_reason, 'duration_limit')
    timer.files.push(ended.artifact!.path)
  } finally { await timer.cleanup() }
  const stuck = fixture()
  try {
    const a = await stuck.sessions.start('stuck')
    stuck.flags({ stuck: true })
    const failed = await stuck.sessions.control(a.trace_id, 'stop')
    assert.equal(failed.reason, 'ACTION_TIMEOUT'); assert.equal(failed.artifact, null)
    assert.equal(stuck.counts.pulls, 0)
    stuck.flags({})
    assert.equal((await stuck.sessions.control(a.trace_id, 'cancel')).cleanup.status, 'complete')
  } finally { await stuck.cleanup() }
  const natural = fixture()
  try {
    const a = await natural.sessions.start('natural')
    natural.native.stop = async (_device, remote) => { natural.processes.delete(remote); throw new Error('PROCESS_ALREADY_EXITED') }
    assert.equal((await natural.sessions.control(a.trace_id, 'cancel')).state, 'cancelled')
  } finally { await natural.cleanup() }
  const interrupted = fixture()
  try {
    const a = await interrupted.sessions.start('journey')
    const finish = await interrupted.sessions.link(a.trace_id, { platform: 'android', id: 'journey' }, 'j')
    interrupted.flags({ find: 'DEVICE_DISCONNECTED' })
    assert.equal((await finish()).coverage, 'partial')
    interrupted.flags({})
  } finally { await interrupted.cleanup() }
  const racing = fixture()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const originalCapabilities = racing.native.capabilities
  racing.native.capabilities = async device => { await gate; return originalCapabilities(device) }
  const starting = racing.sessions.start('race')
  const closing = racing.sessions.shutdown()
  release()
  assert.equal((await starting).reason, 'TRACE_BUSY')
  assert.deepEqual(await closing, [])
  assert.equal(racing.counts.starts, 0)
  const retention = fixture()
  try {
    const first = await retention.sessions.start('retention')
    await retention.sessions.control(first.trace_id, 'cancel')
    for (let n = 0; n < 100; n++) {
      const next = await retention.sessions.start('retention')
      await retention.sessions.control(next.trace_id, 'cancel')
    }
    await assert.rejects(() => retention.sessions.control(first.trace_id, 'status'), /TRACE_NOT_FOUND/)
  } finally { await retention.cleanup() }
  // Wire bytes decode independently to protect actual proto field numbers/limits.
  const config = traceConfig(1001, ['sched', 'input'])
  assert.ok(config.includes(Buffer.from('linux.ftrace')))
  assert.ok(config.includes(Buffer.from([0x18, 0xe9, 0x07]))) // TraceConfig.duration_ms = 3
  assert.ok(config.includes(Buffer.from([0x50, 0x80, 0x80, 0x80, 0x10]))) // max_file_size_bytes = 10
  console.log('system trace session lifecycle: PASS')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
