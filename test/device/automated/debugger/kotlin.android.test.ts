import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, rm } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildDebuggerFixture, debuggerAppId } from '../../../fixtures/debugger-app/build.js'

const deviceId = process.env.MCP_KOTLIN_DEVICE
if (!deviceId) {
  console.log('UNRUN Kotlin debugger fixture: set MCP_KOTLIN_DEVICE, MCP_KOTLINC and MCP_KOTLIN_STDLIB')
} else {
  const fixture = buildDebuggerFixture(true)
  const adbPath = process.env.ADB_PATH ?? 'adb'
  const adb = (...args: string[]) => execFileSync(adbPath, ['-s', deviceId, ...args], { encoding: 'utf8', timeout: 15000 })
  const client = new Client({ name: 'kotlin-locals-validation', version: '1.0.0' })
  let debugSessionId = ''
  let cursor = 0
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = await client.callTool({ name, arguments: args }, undefined, { timeout: 45000 })
    const text = reply.content.find(item => item.type === 'text')
    assert.ok(text?.type === 'text')
    return JSON.parse(text.text)
  }
  const source = await readFile(new URL('../../../fixtures/debugger-app/MainActivity.kt', import.meta.url))
  const line = (marker: string) => source.toString().split('\n').findIndex(row => row.includes(marker)) + 1
  const hash = createHash('sha256')
  const fingerprint = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = directory + '/' + entry.name
      if (entry.isDirectory()) await fingerprint(file)
      else hash.update(file).update(await readFile(file))
    }
  }
  const waitStop = async (expectedLine: number) => {
    for (let i = 0; i < 10; i++) {
      const response = await call('wait_for_debugger_event', { debugSessionId, afterSequence: cursor, timeoutMs: 1000, responseMode: 'compact' })
      assert.equal(response.overflow, false)
      cursor = response.next_cursor
      const event = response.events.find((item: any) => item.event === 'stopped')
      if (event) {
        assert.equal(event.stops[0].location.line, expectedLine)
        assert.equal(event.stops[0].location.method, 'calculate')
        assert.equal(event.stops[0].location.source, 'MainActivity.kt')
        return event
      }
    }
    throw new Error('Expected Kotlin source stop not observed')
  }
  const inspect = async (stop: any) => {
    const stack = await call('get_debugger_stack', { debugSessionId, stopId: stop.stop_id, threadId: stop.thread_id, responseMode: 'compact' })
    const frameId = stack.result.frames[0].frame_id
    const locals = await call('get_debugger_locals', { debugSessionId, stopId: stop.stop_id, frameId, responseMode: 'compact' })
    assert.equal(locals.success, true)
    return { locals: locals.result.locals as { name: string; value: string }[], frameId, availability: locals.result.availability }
  }
  try {
    const forwardsBefore = adb('forward', '--list').trim()
    const javap = process.env.JAVA_HOME ? process.env.JAVA_HOME + '/bin/javap' : 'javap'
    const bytecode = execFileSync(javap, ['-p', '-c', '-l', '-classpath', fixture.directory + '/classes', `${debuggerAppId}.MainActivity`], { encoding: 'utf8' })
    const scopes = Object.fromEntries(['seed', 'known', 'answer'].map(name => {
      const match = bytecode.match(new RegExp('\\s+(\\d+)\\s+(\\d+)\\s+\\d+\\s+' + name + '\\s+I'))
      assert.ok(match, 'Compiler emits a variable scope for ' + name)
      return [name, { start: Number(match[1]), length: Number(match[2]) }]
    }))
    assert.equal(scopes.seed.start, 0)
    assert.ok(scopes.known.start > 0 && scopes.answer.start > scopes.known.start)
    await fingerprint('dist'); await fingerprint('src/debugger/java')
    const version = spawnSync(process.env.MCP_KOTLINC ?? 'kotlinc', ['-version'], { encoding: 'utf8' })
    assert.equal(version.status, 0)
    const compiler = (version.stdout + version.stderr).match(/kotlinc-jvm [^\r\n]+/)?.[0]
    assert.ok(compiler, 'Kotlin compiler identifies its version')
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' }))
    adb('install', '-r', fixture.artifact)
    adb('shell', 'am', 'start', '-W', '-n', `${debuggerAppId}/.MainActivity`)
    const ready = await call('get_ui_tree', { platform: 'android', deviceId })
    const button = ready.elements.find((element: any) => /^kotlin calculate$/i.test(element.text ?? ''))
    assert.ok(button, 'Fresh UI identifies the isolated Kotlin calculation: ' + JSON.stringify(ready))
    const attached = await call('attach_debugger', { platform: 'android', deviceId, appId: debuggerAppId, timeoutMs: 30000 })
    debugSessionId = attached.debug_session_id ?? ''
    assert.equal(attached.success, true, JSON.stringify(attached))
    const breakpoints = []
    for (const marker of ['BREAK_KOTLIN_BEFORE', 'BREAK_KOTLIN_KNOWN', 'BREAK_KOTLIN_RESULT']) {
      const breakpoint = await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.MainActivity`, line: line(marker), responseMode: 'compact' })
      assert.equal(breakpoint.result.status, 'verified', JSON.stringify(breakpoint))
      breakpoints.push(breakpoint.result.breakpoint_id)
    }
    const bounds = button.bounds
    const tap = spawn(adbPath, ['-s', deviceId, 'shell', 'input', 'tap', String(Math.floor((bounds[0] + bounds[2]) / 2)), String(Math.floor((bounds[1] + bounds[3]) / 2))], { stdio: 'ignore' })
    const tapDone = new Promise<void>((resolve, reject) => { tap.on('error', reject); tap.on('exit', code => code === 0 ? resolve() : reject(new Error('Fixture tap failed'))) })
    void tapDone.catch(() => {})
    const before = await waitStop(line('BREAK_KOTLIN_BEFORE'))
    const beforeValues = await inspect(before)
    assert.equal(beforeValues.locals.find(value => value.name === 'seed')?.value, '7')
    assert.equal(beforeValues.locals.find(value => value.name === 'known'), undefined, 'Local is not initialized/in scope at its assignment')
    await call('resume_debugger', { debugSessionId, stopId: before.stop_id, responseMode: 'compact' })
    const known = await waitStop(line('BREAK_KOTLIN_KNOWN'))
    const knownValues = await inspect(known)
    assert.equal(knownValues.locals.find(value => value.name === 'known')?.value, '42')
    assert.equal(knownValues.locals.find(value => value.name === 'answer'), undefined)
    const stale = await call('get_debugger_locals', { debugSessionId, stopId: before.stop_id, frameId: beforeValues.frameId, responseMode: 'compact' })
    assert.equal(stale.error.code, 'DEBUGGER_STALE_REFERENCE')
    await call('resume_debugger', { debugSessionId, stopId: known.stop_id, responseMode: 'compact' })
    const result = await waitStop(line('BREAK_KOTLIN_RESULT'))
    const resultValues = await inspect(result)
    assert.equal(resultValues.locals.find(value => value.name === 'known')?.value, '42')
    assert.equal(resultValues.locals.find(value => value.name === 'answer')?.value, '43')
    for (const breakpointId of breakpoints) await call('remove_debugger_breakpoint', { debugSessionId, breakpointId, responseMode: 'compact' })
    await call('resume_debugger', { debugSessionId, stopId: result.stop_id, responseMode: 'compact' })
    await tapDone
    const detached = await call('detach_debugger', { debugSessionId, responseMode: 'compact' })
    assert.equal(detached.cleanup.status, 'complete')
    assert.deepEqual(detached.cleanup.remaining_resources, [])
    assert.equal(adb('forward', '--list').trim(), forwardsBefore)
    const recovered = await call('get_ui_tree', { platform: 'android', deviceId })
    assert.ok(recovered.elements.some((element: any) => element.text === 'Kotlin result 43'), 'Fresh hierarchy proves execution recovery')
    console.log(JSON.stringify({ status: 'PASS', server_sha256: hash.digest('hex'), source_sha256: createHash('sha256').update(source).digest('hex'), apk_sha256: createHash('sha256').update(await readFile(fixture.artifact)).digest('hex'), compiler, bytecode_scopes: scopes, device: deviceId, api: adb('shell', 'getprop', 'ro.build.version.sdk').trim(), runtime: process.version, lines: [line('BREAK_KOTLIN_BEFORE'), line('BREAK_KOTLIN_KNOWN'), line('BREAK_KOTLIN_RESULT')], observations: ['seed=7; known absent before assignment', 'known=42; answer absent before assignment', 'known=42; answer=43', 'old frame rejected as stale', 'fresh UI Kotlin result 43 after detach'], cleanup: 'owned forwards removed; fixture package and temporary files removed in finally' }))
  } finally {
    if (debugSessionId) {
      const cleanup = await call('detach_debugger', { debugSessionId }).catch(() => null)
      if (cleanup?.cleanup.status !== 'complete') console.error('UNRESOLVED Kotlin debugger cleanup', JSON.stringify(cleanup?.cleanup ?? null))
    }
    try { await client.close() } finally {
      try { adb('uninstall', debuggerAppId) } finally { await rm(fixture.directory, { recursive: true, force: true }) }
    }
  }
}
