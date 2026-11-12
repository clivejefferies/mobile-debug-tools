import { spawn, fork, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { lstat, mkdtemp, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execAdb, getAdbArgs, getAdbCmd } from '../../utils/android/commands.js'
import { HttpTraceRelay } from './relay.js'
import { recordSchema, type TraceRecord } from './records.js'

const timeout = 3000
const readyTimeout = 12000
const appDirectory = 'files/http-trace'
const worker = fileURLToPath(new URL('./backend.js', import.meta.url))
const bundledRelay = fileURLToPath(new URL('../../../assets/http-trace-relay.dex', import.meta.url))
const safeGuest = /^\/data\/local\/tmp\/mdmtrace\.[A-Za-z0-9]+$/

export const adbTrace = (device: string, args: string[]) => execAdb(args, device, { timeout })

export function configuredTraceTransport() {
  const dex = process.env.MCP_HTTP_TRACE_RELAY_DEX ?? bundledRelay
  const backend = process.env.MCP_HTTP_TRACE_MOCKTTP_MODULE
  return process.platform !== 'win32' && dex && backend && isAbsolute(dex) && isAbsolute(backend)
    ? { dex } : undefined
}

export async function validateApp(device: string, appId: string) {
  try {
    if (await adbTrace(device, ['shell', 'run-as', appId, 'cat', `${appDirectory}/version`]) === '1') return
  } catch { /* Return a stable setup error without device output. */ }
  throw new Error('HTTP_TRACE_APP_NOT_OPTED_IN')
}

export async function publishApp(device: string, appId: string, traceId: string, value: object) {
  const base = `${appDirectory}/${traceId}`
  const command = `run-as ${appId} sh -c 'umask 077 && cat > ${base}.tmp && mv ${base}.tmp ${base}.json'`
  const child = spawn(getAdbCmd(), getAdbArgs(['shell', '-T', command], device), {
    stdio: ['pipe', 'ignore', 'ignore'], timeout,
  })
  child.stdin.on('error', () => child.kill())
  child.stdin.end(JSON.stringify(value))
  const [code] = await once(child, 'close')
  if (code !== 0) throw new Error('HTTP_TRACE_APP_SETUP_FAILED')
}

export async function removeApp(device: string, appId: string, traceId: string) {
  await adbTrace(device, ['shell', 'run-as', appId, 'rm', '-f',
    `${appDirectory}/${traceId}.json`, `${appDirectory}/${traceId}.tmp`])
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return
  const closed = once(child, 'close', { signal: AbortSignal.timeout(timeout) })
  child.kill('SIGKILL')
  await closed
}

async function stopBackend(child: ChildProcess) {
  if (!child.connected || child.exitCode !== null || child.signalCode !== null) return stopProcess(child)
  const closed = once(child, 'close', { signal: AbortSignal.timeout(1500) })
  child.send({ stop: true }, () => {})
  try { await closed } catch { await stopProcess(child) }
}

export class TraceResources {
  private directory?: string
  private guest?: string
  private backend?: ChildProcess
  private adb?: ChildProcess
  private bridge?: HttpTraceRelay

  constructor(private readonly device: string, private readonly onDisconnect: () => void) {}

  async start(hosts: string[], onRecord: (record: TraceRecord) => void, signal: AbortSignal) {
    const configuration = configuredTraceTransport()
    if (!configuration) throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE')
    const { dex } = configuration
    signal.throwIfAborted()
    this.directory = await mkdtemp('/tmp/mdm-ht-')
    const socketPath = join(this.directory, 'trace.sock')
    const caCertificate = await this.startBackend(socketPath, hosts, onRecord, signal)
    if (!(await lstat(socketPath)).isSocket()) throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE')
    signal.throwIfAborted()
    const guest = await adbTrace(this.device, ['shell', 'mktemp', '-d', '/data/local/tmp/mdmtrace.XXXXXX'])
    if (!safeGuest.test(guest)) throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE')
    this.guest = guest
    await adbTrace(this.device, ['push', dex, `${guest}/classes.dex`])
    await adbTrace(this.device, ['shell', 'chmod', '400', `${guest}/classes.dex`])
    signal.throwIfAborted()
    const proxyPort = await this.startRelay(guest, socketPath, signal)
    return { proxyPort, caCertificate }
  }

  private async startBackend(socketPath: string, hosts: string[], onRecord: (record: TraceRecord) => void, signal: AbortSignal) {
    const backend = fork(worker, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] })
    this.backend = backend
    backend.once('close', this.onDisconnect)
    backend.on('error', () => this.onDisconnect())
    backend.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object' || !('record' in message)) return
      const record = recordSchema.safeParse(message.record)
      if (record.success && hosts.includes(record.data.host)) onRecord(record.data)
    })
    const [ready] = await this.readyEvent(backend, 'message', signal, () => backend.send({ socketPath, hosts }))
    if (!ready || typeof ready.caCertificate !== 'string' || ready.caCertificate.length > 8192) throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE')
    return ready.caCertificate as string
  }

  private async readyEvent(child: ChildProcess, event: string, signal: AbortSignal, begin: () => void) {
    const done = new AbortController()
    const waiting = AbortSignal.any([done.signal, signal, AbortSignal.timeout(readyTimeout)])
    const ready = Promise.race([
      once(child, event, { signal: waiting }),
      once(child, 'close', { signal: waiting }).then(() => { throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE') }),
    ])
    try {
      begin()
      return await ready
    } finally { done.abort() }
  }

  private async startRelay(guest: string, socketPath: string, signal: AbortSignal) {
    const adb = spawn(getAdbCmd(), getAdbArgs(['shell', '-T',
      `CLASSPATH=${guest}/classes.dex exec app_process /system/bin HttpTraceRelay`], this.device),
    { stdio: ['pipe', 'pipe', 'ignore'] })
    this.adb = adb
    adb.once('close', this.onDisconnect)
    adb.on('error', () => this.onDisconnect())
    const bridge = new HttpTraceRelay(adb.stdout, adb.stdin, socketPath)
    this.bridge = bridge
    void bridge.closed.then(this.onDisconnect, this.onDisconnect)
    const done = new AbortController()
    const waiting = AbortSignal.any([done.signal, signal, AbortSignal.timeout(readyTimeout)])
    try {
      return await Promise.race([
        bridge.port,
        once(adb, 'close', { signal: waiting }).then(() => { throw new Error('HTTP_TRACE_TRANSPORT_UNAVAILABLE') }),
      ])
    } finally { done.abort() }
  }

  async stop() {
    this.bridge?.close()
    const results = await Promise.allSettled([
      this.adb && stopProcess(this.adb),
      this.backend && stopBackend(this.backend),
    ])
    if (results.some(result => result.status === 'rejected')) throw new Error('HTTP_TRACE_CLEANUP_INCOMPLETE')
    if (this.guest) {
      await adbTrace(this.device, ['shell', 'rm', '-rf', this.guest])
      this.guest = undefined
    }
    if (this.directory) await rm(this.directory, { recursive: true, force: true })
  }
}
