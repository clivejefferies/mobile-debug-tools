import { parseWorkerMessage, type WorkerEvent, type WorkerReply } from './protocol.js'
export type { WorkerEvent } from './protocol.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdtemp, chmod, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { detectJavaHome } from '../utils/java.js'

const exec = promisify(execFile)
const operations = new AsyncLocalStorage<{ deadline: number; signal?: AbortSignal }>()
export function withDebuggerBudget<T>(timeout: number, signal: AbortSignal | undefined, operation: () => Promise<T>) {
  return operations.run({ deadline: performance.now() + timeout, signal }, operation)
}
export function debuggerRemaining(fallback: number) {
  const context = operations.getStore()
  if (context?.signal?.aborted) throw new DebuggerError('DEBUGGER_CANCELLED')
  const remaining = Math.floor((context?.deadline ?? Infinity) - performance.now())
  if (remaining <= 0) throw new DebuggerError('DEBUGGER_TIMEOUT')
  return Math.min(fallback, remaining)
}
export function debuggerSignal() { return operations.getStore()?.signal }
export function nativeError(error: unknown, fallback: string): DebuggerError {
  if (error instanceof DebuggerError) return error
  if (debuggerSignal()?.aborted) return new DebuggerError('DEBUGGER_CANCELLED')
  if (typeof error === 'object' && error !== null && 'killed' in error && error.killed) return new DebuggerError('DEBUGGER_TIMEOUT')
  return new DebuggerError(fallback)
}
export class DebuggerError extends Error { constructor(public code: string) { super(code) } }
export const workerSource = fileURLToPath(new URL('../../src/debugger/java/DebuggerWorker.java', import.meta.url))
let compiled: Promise<{ java: string; directory: string }> | undefined
export async function prepareWorker() {
  compiled ??= (async () => {
    const home = await detectJavaHome({ quiet: true })
    const java = home ? path.join(home, 'bin', 'java') : 'java'
    const javac = home ? path.join(home, 'bin', 'javac') : 'javac'
    const version = await exec(java, ['-version'], { timeout: debuggerRemaining(5000), signal: debuggerSignal() })
    const major = Number(/version "(\d+)/.exec(version.stderr)?.[1])
    if (!(major >= 17)) throw new DebuggerError('DEBUGGER_UNSUPPORTED')
    const source = await readFile(workerSource)
    const key = createHash('sha256').update(source).update(version.stderr).digest('hex').slice(0, 16)
    const directory = await mkdtemp(path.join(os.tmpdir(), `mobile-debug-jdi-${key}-`))
    await chmod(directory, 0o700)
    try { await exec(javac, ['--release', '17', '--add-modules', 'jdk.jdi', '-d', directory, workerSource], { timeout: debuggerRemaining(15000), signal: debuggerSignal(), maxBuffer: 1024 * 1024 }) }
    catch (e) { await rm(directory, { recursive: true, force: true }); throw nativeError(e, 'DEBUGGER_UNSUPPORTED') }
    return { java, directory }
  })().catch(error => { compiled = undefined; throw error })
  return compiled
}
export interface DebugWorker {
  call(command: string, args?: Record<string, unknown>, timeout?: number): Promise<WorkerReply>
  close(): Promise<void>
}
export class JdiWorker implements DebugWorker {
  private child: ChildProcessWithoutNullStreams
  private pending = new Map<number, { resolve(value: WorkerReply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  private sequence = 0
  private dead = false
  private exited: Promise<void>
  constructor(java: string, directory: string, onEvent: (event: WorkerEvent) => void) {
    this.child = spawn(java, ['-Xmx128m', '--add-modules', 'jdk.jdi', '-cp', directory, 'DebuggerWorker'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = ''
    const fail = () => {
      if (this.dead) return
      this.dead = true
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new DebuggerError('DEBUGGER_WORKER_FAILED')) }
      this.pending.clear()
      onEvent({ event: 'worker_failed' })
    }
    this.exited = new Promise(resolve => { this.child.once('exit', () => { fail(); resolve() }); this.child.once('error', () => { fail(); resolve() }) })
    this.child.stdin.on('error', fail)
    this.child.stderr.resume() // Never copy worker data or VM diagnostics into MCP stdout/logs.
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) { fail(); this.child.kill('SIGKILL'); return }
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('IPC_LIMIT')
          const msg = parseWorkerMessage(JSON.parse(line))
          if (msg.kind === 'event') onEvent(msg.value)
          else {
            const request = this.pending.get(msg.id)
            if (!request) continue
            clearTimeout(request.timer); this.pending.delete(msg.id)
            if (msg.error) request.reject(new DebuggerError(msg.error.code ?? 'DEBUGGER_WORKER_FAILED'))
            else request.resolve(msg.result)
          }
        } catch { fail(); this.child.kill('SIGKILL'); return }
      }
    })
  }
  call(command: string, args: Record<string, unknown> = {}, timeout = 10000): Promise<WorkerReply> {
    if (this.dead) return Promise.reject(new DebuggerError('DEBUGGER_WORKER_FAILED'))
    try { timeout = Math.min(timeout, debuggerRemaining(timeout)) } catch (e) { return Promise.reject(e) }
    const id = ++this.sequence
    const message = JSON.stringify({ ...args, command, id }) + '\n'
    if (Buffer.byteLength(message) > 1024 * 1024) return Promise.reject(new DebuggerError('INVALID_ARGUMENT'))
    return new Promise((resolve, reject) => {
      const signal = debuggerSignal()
      const abort = () => { this.pending.delete(id); clearTimeout(timer); reject(new DebuggerError('DEBUGGER_CANCELLED')) }
      const done = () => signal?.removeEventListener('abort', abort)
      const timer = setTimeout(() => { this.pending.delete(id); done(); reject(new DebuggerError('DEBUGGER_TIMEOUT')) }, timeout)
      this.pending.set(id, { resolve: value => { done(); resolve(value) }, reject: error => { done(); reject(error) }, timer })
      signal?.addEventListener('abort', abort, { once: true })
      this.child.stdin.write(message)
    })
  }
  async close() {
    this.child.stdin.end()
    const kill = setTimeout(() => this.child.kill('SIGKILL'), 2000)
    try { await this.exited } finally { clearTimeout(kill) }
  }
}
export async function createWorker(onEvent: (event: WorkerEvent) => void) {
  const { java, directory } = await prepareWorker()
  return new JdiWorker(java, directory, onEvent)
}
