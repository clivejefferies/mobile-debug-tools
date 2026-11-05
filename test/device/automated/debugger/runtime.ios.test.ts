import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, rm, readdir, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildIOSDebuggerFixture, iosDebuggerAppId, iosDebuggerSource } from '../../../fixtures/ios-debugger-app/build.js'

if (!process.env.MCP_IOS_DEBUGGER_DEVICE) {
  console.log('UNRUN iOS debugger: select a booted simulator with MCP_IOS_DEBUGGER_DEVICE')
} else {
  const deviceId = process.env.MCP_IOS_DEBUGGER_DEVICE
  const sim = (...args: string[]) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', timeout: 30000 }).trim()
  console.log('Building disposable iOS fixture')
  const fixture = buildIOSDebuggerFixture()
  console.log('Fixture built')
  const source = await readFile(iosDebuggerSource, 'utf8')
  const line = (marker: string) => source.split('\n').findIndex(row => row.includes('// ' + marker)) + 1
  const client = new Client({ name: 'ios-debugger-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
  transport.stderr?.on('data', data => process.stderr.write(data))
  const call = async (name: string, args: Record<string, unknown> = {}, signal?: AbortSignal) => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 45000, signal })
    return JSON.parse((response.content as { type: string; text: string }[]).find(item => item.type === 'text')!.text)
  }
  const hash = createHash('sha256')
  const fingerprint = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = directory + '/' + entry.name
      if (entry.isDirectory()) await fingerprint(file)
      else if (!file.includes('__pycache__')) hash.update(file).update(await readFile(file))
    }
  }
  await fingerprint('dist'); await fingerprint('src/debugger/lldb')
  const serverHash = hash.digest('hex')
  const target = { platform: 'ios', deviceId, appId: iosDebuggerAppId }
  let debugSessionId = '', cursor = 0
  const session = () => ({ debugSessionId })
  const attach = async () => {
    const response = await call('attach_debugger', { ...target, timeoutMs: 30000 })
    assert.equal(response.success, true, JSON.stringify(response))
    assert.equal(response.device.platform, 'ios')
    debugSessionId = response.debug_session_id; cursor = 0
  }
  const breakpoint = async (marker: string) => {
    const response = await call('set_debugger_breakpoint', { ...session(), sourceFile: iosDebuggerSource, line: line(marker) })
    assert.equal(response.success, true, JSON.stringify(response))
    assert.equal(response.result.status, 'resolved', JSON.stringify(response))
    assert.ok(response.result.locations.every((loc: any) => loc.line === line(marker)))
    return response.result.breakpoint_id
  }
  const remove = (breakpointId: string) => call('remove_debugger_breakpoint', { ...session(), breakpointId })
  const stop = async () => {
    for (let i = 0; i < 15; i++) {
      const response = await call('wait_for_debugger_event', { ...session(), afterSequence: cursor, timeoutMs: 1000 })
      assert.equal(response.success, true, JSON.stringify(response)); cursor = response.next_cursor
      const found = response.events.find((event: any) => event.event === 'stopped')
      if (found) { console.log('STOP', JSON.stringify(found)); return found }
    }
    throw new Error('No iOS debugger stop observed')
  }
  const resume = (event: any) => call('resume_debugger', { ...session(), stopId: event.stop_id })
  const locals = async (event: any) => {
    const stack = await call('get_debugger_stack', { ...session(), stopId: event.stop_id, threadId: event.thread_id })
    assert.equal(stack.success, true, JSON.stringify(stack))
    const frame = stack.result.frames.find((f: any) => f.source_file === iosDebuggerSource)
    assert.ok(frame, JSON.stringify(stack))
    const result = await call('get_debugger_locals', { ...session(), stopId: event.stop_id, frameId: frame.frame_id })
    assert.equal(result.success, true, JSON.stringify(result)); console.log('LOCALS', JSON.stringify(result.result))
    return { result: result.result, frame }
  }
  const expectLocal = (result: any, name: string, value: string) => assert.equal(result.locals.find((v: any) => v.name === name)?.value, value, JSON.stringify(result))
  let commandFile = ''
  const trigger = async (command: string) => {
    console.log('TRIGGER', command)
    await writeFile(commandFile + '.next', command)
    await rename(commandFile + '.next', commandFile)
  }
  const tap = async (text: string) => {
    const tree = await call('get_ui_tree', { platform: 'ios', deviceId })
    assert.ok(tree.elements.some((e: any) => e.text === text), JSON.stringify(tree))
    const commands: Record<string, string> = { Calculate: 'calculate', 'Run async': 'async', 'Start cancellation': 'start-cancellation', 'Cancel task': 'cancel' }
    // The installed idb HID backend is unavailable. A fixture-only main-loop
    // command file invokes the same button actions without debugger evaluation.
    await trigger(commands[text])
  }
  const expectUI = async (text: string) => {
    for (let i = 0; i < 15; i++) {
      const tree = await call('get_ui_tree', { platform: 'ios', deviceId })
      if (tree.elements.some((e: any) => e.text === text)) return
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error('Missing independent UI state: ' + text)
  }
  const detach = async () => {
    const response = await call('detach_debugger', session())
    assert.equal(response.cleanup.status, 'complete', JSON.stringify(response))
    assert.deepEqual(response.cleanup.remaining_resources, [])
    assert.equal((await call('detach_debugger', session())).cleanup.status, 'complete')
  }
  try {
    sim('install', deviceId, fixture.app)
    sim('launch', deviceId, iosDebuggerAppId)
    commandFile = sim('get_app_container', deviceId, iosDebuggerAppId, 'data') + '/Documents/debugger-command'
    await client.connect(transport)
    const shortProbe = await call('get_debugger_capabilities', { ...target, timeoutMs: 100 })
    assert.equal(shortProbe.error?.code, 'DEBUGGER_TIMEOUT')
    const absent = await call('get_debugger_capabilities', { ...target, appId: 'dev.mobiledebug.absentfixture' })
    assert.equal(absent.supported, false); assert.ok(absent.reasons.includes('PROCESS_NOT_FOUND'))
    const cap = await call('get_debugger_capabilities', target)
    assert.equal(cap.supported, true, JSON.stringify(cap))
    assert.equal(cap.capabilities.async_execution_inspection, true)
    assert.equal(cap.capabilities.async_stepping, true)
    const foreign = await call('attach_debugger', { ...target, processId: process.pid })
    assert.equal(foreign.success, false); assert.equal(foreign.error.code, 'PROCESS_NOT_FOUND')
    await attach()
    const bp = await breakpoint('BREAK_CALCULATE')
    const pending = await call('set_debugger_breakpoint', { ...session(), sourceFile: '/tmp/nonexistent-ios-debugger-source.swift', line: 1 })
    assert.equal(pending.result.status, 'pending'); await remove(pending.result.breakpoint_id)
    const noncode = await call('set_debugger_breakpoint', { ...session(), sourceFile: iosDebuggerSource, line: 9999 })
    assert.equal(noncode.result.status, 'rejected'); await remove(noncode.result.breakpoint_id)
    const storedHandle = await call('wait_for_ui', { platform: 'ios', deviceId, selector: { text: 'Calculate' }, condition: 'exists', timeout_ms: 10000 })
    assert.equal(storedHandle.status, 'success', JSON.stringify(storedHandle))
    assert.ok(storedHandle.element.elementId)
    await tap('Calculate')
    let event = await stop()
    const originalStop = event
    assert.equal(event.location.line, line('BREAK_CALCULATE'))
    const inspected = await locals(event); expectLocal(inspected.result, 'known', '41')
    const guarded = await call('tap', { platform: 'ios', deviceId, x: 10, y: 10 })
    assert.equal(guarded.failure_code, 'DEBUGGER_PAUSED'); assert.equal(guarded.delivery_status, 'not_delivered')
    const storedTap = await call('tap_element', { elementId: storedHandle.element.elementId, verificationMode: 'none', responseMode: 'compact' })
    assert.equal(storedTap.failure_code, 'DEBUGGER_PAUSED', JSON.stringify(storedTap))
    assert.equal(storedTap.delivery_status, 'not_delivered'); assert.equal(storedTap.dispatch_started, false)
    assert.deepEqual(storedTap.debugger.device, { platform: 'ios', id: deviceId })
    console.log('PASS paused stored iOS handle without platform/device hints rejected before dispatch')
    const readiness = await call('get_app_readiness', { platform: 'ios', deviceId })
    assert.equal(readiness.readiness.state, 'debugger_paused')
    assert.deepEqual(readiness.device_readiness.blockers, ['DEBUGGER_PAUSED'])
    assert.equal(readiness.device_readiness.input_ready, false)
    const readyWait = await call('wait_for_app_ready', { platform: 'ios', deviceId })
    assert.equal(readyWait.failure_code, 'DEBUGGER_PAUSED')
    assert.deepEqual(readyWait.device_readiness.blockers, ['DEBUGGER_PAUSED'])
    await remove(bp)
    for (const kind of ['into', 'over', 'out']) {
      const response = await call('step_debugger', { ...session(), stopId: event.stop_id, threadId: event.thread_id, kind })
      assert.equal(response.success, true, JSON.stringify(response)); event = await stop()
    }
    const stale = await call('get_debugger_locals', { ...session(), stopId: originalStop.stop_id, frameId: inspected.frame.frame_id })
    assert.equal(stale.error.code, 'DEBUGGER_STALE_REFERENCE')
    await resume(event)
    await expectUI('Debugger result 42')
    const controller = new AbortController()
    const waiting = call('wait_for_debugger_event', { ...session(), afterSequence: cursor, timeoutMs: 30000 }, controller.signal)
    setTimeout(() => controller.abort(), 100)
    await assert.rejects(waiting)
    assert.equal((await call('get_debugger_state', session())).state, 'running')
    await detach()

    await attach()
    const before = await breakpoint('BEFORE_AWAIT'), after = await breakpoint('AFTER_AWAIT')
    await tap('Run async')
    event = await stop(); assert.equal(event.location.line, line('BEFORE_AWAIT'))
    expectLocal((await locals(event)).result, 'known', '42')
    await remove(before)
    await resume(event)
    event = await stop(); assert.equal(event.location.line, line('AFTER_AWAIT'))
    expectLocal((await locals(event)).result, 'after', '43')
    await remove(after); await resume(event)
    await expectUI('Async result 44')
    await detach()

    // Boundary stepping has a distinct evidence result, independent of breakpoint coverage.
    await attach()
    const boundary = await breakpoint('BEFORE_AWAIT')
    await tap('Run async'); event = await stop(); await remove(boundary)
    assert.equal((await call('step_debugger', { ...session(), stopId: event.stop_id, threadId: event.thread_id, kind: 'over' })).success, true)
    event = await stop()
    assert.equal(event.location.source_file, iosDebuggerSource)
    assert.equal(event.location.line, line('AFTER_AWAIT'), 'Advertised async stepping must follow the continuation')
    console.log('ASYNC_BOUNDARY_STEP', JSON.stringify({ expected_line: line('AFTER_AWAIT'), observed: event.location }))
    await detach(); await expectUI('Async result 44')

    await attach()
    const cancel = await breakpoint('CANCELLED')
    await tap('Start cancellation'); await expectUI('Task running'); await tap('Cancel task')
    event = await stop(); expectLocal((await locals(event)).result, 'cancelled', 'true')
    await remove(cancel); await resume(event); await detach(); await expectUI('Task cancelled')

    if (process.env.MCP_IOS_DEBUGGER_EXTENDED === '1') {
      await attach(); await breakpoint('BREAK_CALCULATE'); await tap('Calculate'); await stop()
      const deadline = Date.now() + 75000
      let state: any
      do { await new Promise(resolve => setTimeout(resolve, 1000)); state = await call('get_debugger_state', session()) } while (state.state === 'paused' && Date.now() < deadline)
      assert.equal(state.reason, 'pause_limit'); assert.equal(state.cleanup.status, 'complete')
      await expectUI('Debugger result 42')
    }
    await attach()
    await trigger('exit')
    let exited: any
    for (let i = 0; i < 100; i++) {
      exited = await call('get_debugger_state', session())
      if (exited.state === 'disconnected' && exited.cleanup.status === 'complete') break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(exited.state, 'disconnected'); assert.equal(exited.cleanup.status, 'complete')
    sim('launch', deviceId, iosDebuggerAppId); await expectUI('Debugger ready')
    // Clear the earlier calculate result before proving shutdown recovery.
    await tap('Start cancellation'); await expectUI('Task running'); await tap('Cancel task'); await expectUI('Task cancelled')
    // Closing the server while paused must release its owned suspension.
    await attach(); await breakpoint('BREAK_CALCULATE'); await tap('Calculate'); await stop()
    await client.close()
    const verifier = new Client({ name: 'ios-cleanup-verifier', version: '1.0.0' })
    await verifier.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' }))
    try {
      const response = await verifier.callTool({ name: 'get_ui_tree', arguments: { platform: 'ios', deviceId } })
      const tree = JSON.parse((response.content as any[])[0].text)
      assert.ok(tree.elements.some((e: any) => e.text === 'Debugger result 42'), JSON.stringify(tree))
    } finally { await verifier.close() }
    console.log('PASS iOS MCP debugger core/async/cancellation/cleanup', JSON.stringify({ deviceId, server_sha256: serverHash, source_sha256: createHash('sha256').update(source).digest('hex'), xcode: execFileSync('xcodebuild', ['-version'], { encoding: 'utf8' }).trim(), lldb: execFileSync('xcrun', ['lldb', '--version'], { encoding: 'utf8' }).trim() }))
  } finally {
    if (debugSessionId) { try { await call('detach_debugger', session()) } catch {} }
    await client.close().catch(() => {})
    sim('uninstall', deviceId, iosDebuggerAppId)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}
