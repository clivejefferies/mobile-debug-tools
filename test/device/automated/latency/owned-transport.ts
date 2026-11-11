import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

// A dedicated POSIX process group bounds cleanup to this benchmark's server
// and its children. The SDK client and stdio wire protocol are unchanged.
export class OwnedTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  private child?: ChildProcessWithoutNullStreams
  private buffer = new ReadBuffer({ maxBufferSize: 64 * 1024 * 1024 })
  private closed?: Promise<void>
  private closing?: Promise<void>
  cleanupVerified = false
  constructor(private env: NodeJS.ProcessEnv, private stderr: (chunk: string) => void,
    private args = ['dist/server.js']) {}

  async start() {
    if (process.platform === 'win32') throw new Error('POSIX benchmark transport required')
    if (this.child) throw new Error('Already started')
    this.child = spawn(process.execPath, this.args, { env: this.env, detached: true, stdio: 'pipe' })
    this.closed = new Promise(resolve => this.child!.once('close', () => { this.onclose?.(); resolve() }))
    this.child.on('error', error => this.onerror?.(error))
    this.child.stdin.on('error', error => this.onerror?.(error))
    this.child.stderr.on('data', chunk => this.stderr(String(chunk)))
    this.child.stdout.on('data', chunk => {
      try {
        this.buffer.append(chunk)
        let message
        while ((message = this.buffer.readMessage()) !== null) this.onmessage?.(message)
      } catch (error) { this.onerror?.(error as Error) }
    })
    await new Promise<void>((resolve, reject) => { this.child!.once('spawn', resolve); this.child!.once('error', reject) })
  }

  async send(message: JSONRPCMessage) {
    if (!this.child) throw new Error('Not started')
    await new Promise<void>((resolve, reject) => this.child!.stdin.write(serializeMessage(message), error => error ? reject(error) : resolve()))
  }

  private groupExists() {
    if (!this.child?.pid) return false
    try { process.kill(-this.child.pid, 0); return true }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ESRCH') return false
      // Darwin can return EPERM while a killed group is being reaped. It is
      // still unconfirmed: retry until ESRCH, never count EPERM as absence.
      if (code === 'EPERM') return true
      throw error
    }
  }

  private signal(signal: NodeJS.Signals) {
    if (!this.child?.pid) return
    try { process.kill(-this.child.pid, signal) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }

  close() {
    this.closing ??= this.cleanup()
    return this.closing
  }

  private async cleanup() {
    if (!this.child) { this.cleanupVerified = true; return }
    this.child.stdin.end()
    await Promise.race([this.closed, delay(1000)])
    if (this.groupExists()) this.signal('SIGTERM')
    await Promise.race([this.closed, delay(1000)])
    if (this.groupExists()) this.signal('SIGKILL')
    const deadline = performance.now() + 3000
    while (this.groupExists() && performance.now() < deadline) await delay(50)
    this.cleanupVerified = !this.groupExists()
    this.buffer.clear()
    if (!this.cleanupVerified) throw new Error('Owned process group did not exit')
  }
}
