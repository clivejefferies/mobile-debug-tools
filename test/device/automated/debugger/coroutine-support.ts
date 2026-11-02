import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { coroutineAppId } from '../../../fixtures/coroutine-app/build.js'

type Location = { line: number; method: string; source: string; class_name?: string }
export type Stop = { stop_id: string; thread_id: string; stops: { location: Location }[] }
type Frame = { frame_id: string; location: Location }
type Reply = {
  success: boolean; debug_session_id: string; supported: boolean; next_cursor: number; overflow: boolean
  events: (Stop & { event: string })[]; error: { code: string }; failure_code: string; dispatch_started: boolean
  result: { breakpoint_id: string; status: string; frames: Frame[]; locals: { name: string; value: unknown }[]; availability: string }
  elements: { text?: string; bounds: number[] }[]
  cleanup: { status: string; remaining_resources: unknown[] }
}
export class CoroutineJourney {
  readonly client = new Client({ name: 'coroutine-validation', version: '1.0.0' })
  readonly interruption = new AbortController()
  session = ''
  cursor = 0
  observations: unknown[] = []
  constructor(readonly device: string, readonly source: string) {}
  adb(...args: string[]) {
    return execFileSync(process.env.ADB_PATH ?? 'adb', ['-s', this.device, ...args], { encoding: 'utf8', timeout: 15000 })
  }
  async connect() {
    await this.client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' }))
  }
  async call(name: string, args: Record<string, unknown> = {}) {
    console.log('Coroutine MCP', name)
    const reply = await this.client.callTool({ name, arguments: { ...args, ...(this.session ? { debugSessionId: this.session } : {}) } }, undefined, { timeout: 45000, ...(name === 'detach_debugger' ? {} : { signal: this.interruption.signal }) })
    const content = reply.content.find(item => item.type === 'text')
    assert.ok(content?.type === 'text')
    return JSON.parse(content.text) as Reply
  }
  line(marker: string) {
    const index = this.source.split('\n').findIndex(row => row.includes('// ' + marker))
    assert.ok(index >= 0, marker)
    return index + 1
  }
  async attach() {
    this.cursor = 0
    const capabilities = await this.call('get_debugger_capabilities', { platform: 'android', deviceId: this.device, appId: coroutineAppId })
    assert.equal(capabilities.supported, true, JSON.stringify(capabilities))
    const result = await this.call('attach_debugger', { platform: 'android', deviceId: this.device, appId: coroutineAppId, timeoutMs: 30000 })
    this.session = result.debug_session_id ?? ''
    assert.equal(result.success, true, JSON.stringify(result))
  }
  async detach() {
    if (!this.session) return
    const result = await this.call('detach_debugger')
    assert.equal(result.cleanup.status, 'complete', JSON.stringify(result))
    assert.deepEqual(result.cleanup.remaining_resources, [])
    this.session = ''
  }
  async breakpoint(marker: string, suffix = '') {
    const result = await this.call('set_debugger_breakpoint', { className: coroutineAppId + '.MainActivity' + suffix, line: this.line(marker), responseMode: 'compact' })
    assert.ok(['verified', 'pending'].includes(result.result.status), JSON.stringify(result))
    return result.result.breakpoint_id
  }
  async remove(breakpointId: string) {
    assert.equal((await this.call('remove_debugger_breakpoint', { breakpointId })).success, true)
  }
  async stop(marker?: string, attempts = 10): Promise<Stop | undefined> {
    for (let index = 0; index < attempts; index++) {
      const result = await this.call('wait_for_debugger_event', { afterSequence: this.cursor, timeoutMs: 1000, responseMode: 'compact' })
      assert.equal(result.success, true, JSON.stringify(result))
      assert.equal(result.overflow, false)
      this.cursor = result.next_cursor
      const stop = result.events.find(event => event.event === 'stopped')
      if (!stop) continue
      if (marker) {
        assert.equal(stop.stops[0].location.line, this.line(marker), JSON.stringify(stop))
        assert.equal(stop.stops[0].location.source, 'MainActivity.kt')
      }
      this.observations.push({ marker, stop })
      return stop
    }
    if (marker) throw new Error('Expected source stop: ' + marker)
  }
  async inspect(stop: Stop, label: string) {
    const stack = await this.call('get_debugger_stack', { stopId: stop.stop_id, threadId: stop.thread_id, responseMode: 'compact' })
    assert.equal(stack.success, true, JSON.stringify(stack))
    const frame = stack.result.frames[0]
    const locals = await this.call('get_debugger_locals', { stopId: stop.stop_id, frameId: frame.frame_id, responseMode: 'compact' })
    assert.equal(locals.success, true, JSON.stringify(locals))
    this.observations.push({ label, frames: stack.result.frames, locals: locals.result })
    return { frameId: frame.frame_id, locals: locals.result.locals }
  }
  async resume(stop: Stop) {
    assert.equal((await this.call('resume_debugger', { stopId: stop.stop_id })).success, true)
  }
  async step(stop: Stop, kind: string) {
    const result = await this.call('step_debugger', { stopId: stop.stop_id, threadId: stop.thread_id, kind })
    assert.equal(result.success, true, JSON.stringify(result))
  }
  async tree() { return this.call('get_ui_tree', { platform: 'android', deviceId: this.device }) }
  async visible(text: string) {
    for (let index = 0; index < 10; index++) {
      if ((await this.tree()).elements.some(element => element.text === text)) return
    }
    throw new Error('Fresh UI did not show ' + text + ': ' + JSON.stringify(await this.tree()))
  }
  async tap(text: string) {
    const button = (await this.tree()).elements.find(element => element.text?.toLowerCase() === text.toLowerCase())
    assert.ok(button, 'UI button ' + text)
    const [left, top, right, bottom] = button.bounds
    // Input stays asynchronous: its shell process may wait while the VM is paused.
    const child = spawn(process.env.ADB_PATH ?? 'adb', ['-s', this.device, 'shell', 'input', 'tap', String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))], { stdio: 'ignore' })
    const timer = setTimeout(() => child.kill(), 15000)
    const done = new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Fixture tap failed: ' + code)) })
    })
    void done.catch(() => {})
    return { done }
  }
  async cancelledWait() {
    const controller = new AbortController()
    const waiting = this.client.callTool({ name: 'wait_for_debugger_event', arguments: { debugSessionId: this.session, afterSequence: this.cursor, timeoutMs: 1000 } }, undefined, { signal: controller.signal, timeout: 5000 })
    const timer = setTimeout(() => controller.abort(), 100)
    try { await assert.rejects(waiting) } finally { clearTimeout(timer) }
    assert.equal((await this.call('get_debugger_state')).success, true)
  }
}
export async function fingerprint(directory: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(folder: string): Promise<void> {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = folder + '/' + entry.name
      if (entry.isDirectory()) await visit(file)
      else hash.update(file).update(await readFile(file))
    }
  }
  await visit(directory)
  return hash.digest('hex')
}
