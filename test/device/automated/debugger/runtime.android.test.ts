import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createHash } from 'node:crypto'
import { buildDebuggerFixture, debuggerAppId } from '../../../fixtures/debugger-app/build.js'

// Explicit opt-in: installs/removes only this isolated fixture on the selected device.
if (!process.env.MCP_DEBUGGER_DEVICE) {
  console.log('UNRUN Android debugger fixture: set MCP_DEBUGGER_DEVICE to an authorized emulator serial')
} else {
  const deviceId = process.env.MCP_DEBUGGER_DEVICE
  const adb = (...args: string[]) => execFileSync(process.env.ADB_PATH || 'adb', ['-s', deviceId, ...args], { encoding: 'utf8', timeout: 15000 })
  const client = new Client({ name: 'android-debugger-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 45000 })
    const text = (response.content as any[]).find(c => c.type === 'text')!.text!
    return JSON.parse(text)
  }
  const hash = createHash('sha256')
  const fingerprint = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = directory + '/' + entry.name
      if (entry.isDirectory()) await fingerprint(file)
      else hash.update(file).update(await readFile(file))
    }
  }
  await fingerprint('dist'); await fingerprint('src/debugger/java')
  const buildHash = hash.digest('hex')
  const fixture = buildDebuggerFixture()
  const source = await readFile(new URL('../../../fixtures/debugger-app/MainActivity.java', import.meta.url), 'utf8')
  const line = (marker: string) => source.split('\n').findIndex(l => l.includes(marker)) + 1
  let debugSessionId = ''
  let cursor = 0
  const eventsUntilStop = async () => {
    for (let i = 0; i < 10; i++) {
      const result = await call('wait_for_debugger_event', { debugSessionId, afterSequence: cursor, timeoutMs: 1000 })
      cursor = result.next_cursor
      if (result.events.length) console.log('Debug events', JSON.stringify(result.events))
      const event = result.events.find((e: any) => e.event === 'stopped')
      if (event) return event
    }
    throw new Error('No debugger stop observed')
  }
  const forwardsBefore = adb('forward', '--list').trim()
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    assert.ok(listed.tools.some(tool => tool.name === 'attach_debugger'))
    adb('install', '-r', fixture.artifact)
    adb('shell', 'am', 'start', '-W', '-n', `${debuggerAppId}/.MainActivity`)
    const cap = await call('get_debugger_capabilities', { platform: 'android', deviceId, appId: debuggerAppId })
    assert.equal(cap.supported, true, JSON.stringify(cap))
    const timeout = await call('get_debugger_capabilities', { platform: 'android', deviceId, appId: debuggerAppId, timeoutMs: 100 })
    assert.equal(timeout.error.code, 'DEBUGGER_TIMEOUT')
    const unsupported = await call('get_debugger_capabilities', { platform: 'android', deviceId, appId: 'com.missing.debugfixture' })
    assert.equal(unsupported.supported, false)
    assert.ok(unsupported.reasons.includes('PROCESS_NOT_FOUND'))
    const attached = await call('attach_debugger', { platform: 'android', deviceId, appId: debuggerAppId, timeoutMs: 30000 })
    assert.equal(attached.success, true, JSON.stringify(attached)); debugSessionId = attached.debug_session_id
    const bp = await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.MainActivity`, line: line('BREAK_CALCULATE') })
    assert.equal(bp.result.status, 'verified', JSON.stringify(bp))
    const pending = await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.LateWork`, line: line('BREAK_LATE') })
    assert.equal(pending.result.status, 'pending', JSON.stringify(pending))
    const unavailable = await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.MainActivity`, line: 9999 })
    assert.equal(unavailable.result.status, 'rejected')
    // Fixture button placement is obtained from real UI semantics, not fixed coordinates.
    const tree = await call('get_ui_tree', { platform: 'android', deviceId })
    const button = tree.elements.find((e: any) => /^calculate$/i.test(e.text ?? ''))
    assert.ok(button, 'Calculate button visible in real UI tree: ' + JSON.stringify(tree))
    console.log('Fixture target', JSON.stringify({ bounds: button.bounds, device: tree.device, resolution: tree.resolution }))
    const [left, top, right, bottom] = button.bounds
    // Shell input is asynchronous so suspension cannot block the test's next debugger call.
    await writeFile(fixture.directory + '/fixture.png', execFileSync(process.env.ADB_PATH || 'adb', ['-s', deviceId, 'exec-out', 'screencap', '-p']))
    const tap = spawn(process.env.ADB_PATH || 'adb', ['-s', deviceId, 'shell', 'input', 'tap', String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))], { stdio: 'ignore' })
    tap.on('error', error => { throw error })
    const stop = await eventsUntilStop()
    assert.equal(stop.stops[0].location.line, line('BREAK_CALCULATE'))
    const stack = await call('get_debugger_stack', { debugSessionId, stopId: stop.stop_id, threadId: stop.thread_id })
    assert.equal(stack.result.frames[0].location.method, 'calculate')
    const frameId = stack.result.frames[0].frame_id
    const locals = await call('get_debugger_locals', { debugSessionId, stopId: stop.stop_id, frameId })
    assert.equal(locals.result.locals.find((v: any) => v.name === 'known')?.value, '42', JSON.stringify(locals))
    const longText = locals.result.locals.find((v: any) => v.name === 'longText')
    assert.equal(longText.value.length, 256); assert.equal(longText.truncated, true)
    const object = locals.result.locals.find((v: any) => v.name === 'object')
    assert.equal(object.value.type, 'java.lang.Object'); assert.equal(typeof object.value.object_id, 'string')
    const readiness = await call('get_app_readiness', { platform: 'android', deviceId })
    assert.equal(readiness.readiness.state, 'debugger_paused')
    for (const name of ['tap', 'wait_for_ui', 'terminate_app', 'run_journey']) {
      const blocked = await call(name, { platform: 'android', deviceId, x: 5, y: 5, appId: debuggerAppId })
      assert.equal(blocked.failure_code, 'DEBUGGER_PAUSED', name)
      assert.equal(blocked.dispatch_started, false)
    }
    await call('remove_debugger_breakpoint', { debugSessionId, breakpointId: bp.result.breakpoint_id })
    const step = await call('step_debugger', { debugSessionId, stopId: stop.stop_id, threadId: stop.thread_id, kind: 'into' })
    assert.equal(step.success, true, JSON.stringify(step))
    const stale = await call('get_debugger_locals', { debugSessionId, stopId: stop.stop_id, frameId })
    assert.equal(stale.error.code, 'DEBUGGER_STALE_REFERENCE')
    const into = await eventsUntilStop()
    assert.equal(into.stops[0].location.method, 'increment')
    assert.equal((await call('step_debugger', { debugSessionId, stopId: into.stop_id, threadId: into.thread_id, kind: 'over' })).success, true)
    const over = await eventsUntilStop()
    assert.equal(over.stops[0].location.method, 'increment')
    assert.equal((await call('step_debugger', { debugSessionId, stopId: over.stop_id, threadId: over.thread_id, kind: 'out' })).success, true)
    const out = await eventsUntilStop()
    assert.equal(out.stops[0].location.method, 'calculate')
    assert.equal((await call('resume_debugger', { debugSessionId, stopId: out.stop_id })).success, true)
    let resultVisible = false
    for (let i = 0; i < 10; i++) {
      const observed = await call('get_ui_tree', { platform: 'android', deviceId })
      if (observed.elements.some((e: any) => e.text === 'Result 43')) { resultVisible = true; break }
    }
    assert.ok(resultVisible, 'UI tree independently establishes resumed execution: Result 43')
    const noLocalsSource = await readFile(new URL('../../../fixtures/debugger-app/NoLocals.java', import.meta.url), 'utf8')
    const noLocalsLine = noLocalsSource.split('\n').findIndex(line => line.includes('BREAK_NO_LOCALS')) + 1
    const removedPending = await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.NoLocals`, line: noLocalsLine })
    await call('remove_debugger_breakpoint', { debugSessionId, breakpointId: removedPending.result.breakpoint_id })
    await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.NoLocals`, line: noLocalsLine })
    const metadataTree = await call('get_ui_tree', { platform: 'android', deviceId })
    const mb = metadataTree.elements.find((e: any) => /^no locals$/i.test(e.text ?? '')).bounds
    spawn(process.env.ADB_PATH || 'adb', ['-s', deviceId, 'shell', 'input', 'tap', String(Math.floor((mb[0] + mb[2]) / 2)), String(Math.floor((mb[1] + mb[3]) / 2))], { stdio: 'ignore' })
    const metadataStop = await eventsUntilStop()
    assert.ok(metadataStop.stops.every((stop: any) => stop.breakpoint_id !== removedPending.result.breakpoint_id), 'removed pending breakpoint never rebinds')
    const metadataStack = await call('get_debugger_stack', { debugSessionId, stopId: metadataStop.stop_id, threadId: metadataStop.thread_id })
    const metadataLocals = await call('get_debugger_locals', { debugSessionId, stopId: metadataStop.stop_id, frameId: metadataStack.result.frames[0].frame_id })
    assert.equal(metadataLocals.result.availability, 'unknown')
    assert.equal(metadataLocals.result.reason, 'EMPTY_OR_UNAVAILABLE_VARIABLE_METADATA')
    await call('resume_debugger', { debugSessionId, stopId: metadataStop.stop_id })
    const lateTree = await call('get_ui_tree', { platform: 'android', deviceId })
    const lateButton = lateTree.elements.find((e: any) => /^late class$/i.test(e.text ?? ''))
    assert.ok(lateButton)
    const bounds = lateButton.bounds
    spawn(process.env.ADB_PATH || 'adb', ['-s', deviceId, 'shell', 'input', 'tap', String(Math.floor((bounds[0] + bounds[2]) / 2)), String(Math.floor((bounds[1] + bounds[3]) / 2))], { stdio: 'ignore' })
    const lateStop = await eventsUntilStop()
    assert.equal(lateStop.stops[0].location.class_name, `${debuggerAppId}.LateWork`)
    assert.equal(lateStop.stops[0].location.line, line('BREAK_LATE'))
    const aborted = new AbortController()
    const cancelled = client.callTool({ name: 'wait_for_debugger_event', arguments: { debugSessionId, afterSequence: cursor, timeoutMs: 1000 } }, undefined, { signal: aborted.signal, timeout: 5000 })
    const cancelTimer = setTimeout(() => aborted.abort(), 100)
    try { await assert.rejects(cancelled) } finally { clearTimeout(cancelTimer) }
    assert.equal((await call('get_debugger_state', { debugSessionId })).state, 'paused')
    if (process.env.MCP_DEBUGGER_EXTENDED === '1') {
      console.log('Checking real 60-second pause expiry while polling state')
      const deadline = Date.now() + 65000
      let state: any
      do {
        await new Promise(resolve => setTimeout(resolve, 1000))
        state = await call('get_debugger_state', { debugSessionId })
      } while (state.state === 'paused' && Date.now() < deadline)
      assert.equal(state.state, 'detached', JSON.stringify(state))
      assert.equal(state.reason, 'pause_limit')
      assert.equal(state.cleanup.status, 'complete')
      console.log('PASS real pause expiry despite active client polling')
    }
    const detach = await call('detach_debugger', { debugSessionId })
    assert.equal(detach.cleanup.status, 'complete', JSON.stringify(detach))
    assert.equal((await call('detach_debugger', { debugSessionId })).cleanup.status, 'complete')
    assert.equal(adb('forward', '--list').trim(), forwardsBefore, 'unrelated forwards preserved')
    const reattached = await call('attach_debugger', { platform: 'android', deviceId, appId: debuggerAppId, timeoutMs: 30000 })
    assert.equal(reattached.success, true, JSON.stringify(reattached))
    debugSessionId = reattached.debug_session_id
    adb('shell', 'am', 'force-stop', debuggerAppId)
    let disconnected: any
    for (let i = 0; i < 20; i++) {
      disconnected = await call('get_debugger_state', { debugSessionId })
      if (disconnected.cleanup.status === 'complete') break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(disconnected.state, 'disconnected', JSON.stringify(disconnected))
    assert.equal(disconnected.cleanup.status, 'complete')
    assert.equal(adb('forward', '--list').trim(), forwardsBefore)
    // Disconnect the MCP client with an actively paused session; shutdown owns resume/dispose.
    adb('shell', 'am', 'start', '-W', '-n', `${debuggerAppId}/.MainActivity`)
    const shutdownSession = await call('attach_debugger', { platform: 'android', deviceId, appId: debuggerAppId, timeoutMs: 30000 })
    assert.equal(shutdownSession.success, true, JSON.stringify(shutdownSession))
    debugSessionId = shutdownSession.debug_session_id; cursor = 0
    await call('set_debugger_breakpoint', { debugSessionId, className: `${debuggerAppId}.MainActivity`, line: line('BREAK_CALCULATE') })
    const shutdownTree = await call('get_ui_tree', { platform: 'android', deviceId })
    const shutdownButton = shutdownTree.elements.find((e: any) => /^calculate$/i.test(e.text ?? ''))
    const sb = shutdownButton.bounds
    spawn(process.env.ADB_PATH || 'adb', ['-s', deviceId, 'shell', 'input', 'tap', String(Math.floor((sb[0] + sb[2]) / 2)), String(Math.floor((sb[1] + sb[3]) / 2))], { stdio: 'ignore' })
    await eventsUntilStop()
    await client.close(); debugSessionId = ''
    assert.equal(adb('forward', '--list').trim(), forwardsBefore, 'MCP disconnect cleans active owned forward')
    const verifier = new Client({ name: 'debugger-shutdown-verifier', version: '1.0.0' })
    try {
      await verifier.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' }))
      const result = await verifier.callTool({ name: 'get_ui_tree', arguments: { platform: 'android', deviceId } })
      const treeAfterShutdown = JSON.parse((result.content as any[]).find(c => c.type === 'text').text)
      assert.ok(treeAfterShutdown.elements.some((e: any) => e.text === 'Result 43'), 'fresh UI proves paused fixture resumed after server shutdown')
    } finally { await verifier.close() }
    console.log(JSON.stringify({ status: 'PASS', build_sha256: buildHash, device: deviceId, api: adb('shell', 'getprop', 'ro.build.version.sdk').trim(), runtime: process.version, transport: 'MCP stdio', extended: process.env.MCP_DEBUGGER_EXTENDED === '1' }))
    console.log('PASS Android debugger: explicit attach, source stop, stack/known locals, pause guards, into/over/out, stale frame, resume UI, detach/forward ownership')
  } finally {
    if (debugSessionId) await call('detach_debugger', { debugSessionId }).catch(() => {})
    await client.close()
    adb('uninstall', debuggerAppId)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}
