import { createRequire } from 'node:module'
import { isAbsolute } from 'node:path'
import { z } from 'zod'

import { methodPattern, type TraceRecord } from './records.js'

type Request = { id: string; protocol: string; method: string; destination: { hostname: string } }
type Response = { id: string; statusCode: number; tags: string[] }
type LocalMatcher = { matches(request: Request): boolean; explain(): string; dispose(): void }
type Proxy = {
  readonly address: unknown
  start(): Promise<void>
  stop(): Promise<void>
  addRequestRules(rule: { matchers: LocalMatcher[]; steps: unknown[] }): Promise<unknown>
  forUnmatchedRequest(): { thenReply(status: number, body: string): Promise<unknown> }
  on(event: 'response-initiated', callback: (response: Response) => void): Promise<void>
  on(event: 'abort', callback: (request: Request) => void): Promise<void>
}
type Mockttp = {
  getLocal(options: { unixSocketPath: string; https?: { cert: string; key: string }; maxBodySize?: number; recordTraffic?: boolean }): Proxy
  generateCACertificate(): Promise<{ cert: string; key: string }>
  requestSteps: { PassThroughStep: new (options: { ignoreHostHttpsErrors: false }) => unknown }
}

function loadBackend(): Mockttp {
  const modulePath = process.env.MCP_HTTP_TRACE_MOCKTTP_MODULE
  if (!modulePath || !isAbsolute(modulePath)) throw new Error('Backend unavailable')
  const backend = createRequire(import.meta.url)(modulePath) as Mockttp
  // The tested local API rejects relative paths at construction. Probe without starting
  // anything so older Mockttp builds cannot accidentally open a TCP listener.
  try {
    backend.getLocal({ unixSocketPath: 'relative.sock' })
  } catch (error) {
    if (error instanceof Error && error.message === 'unixSocketPath requires an absolute Unix domain socket path') return backend
  }
  throw new Error('Private listener support unavailable')
}

async function start(socketPath: string, hosts: string[]) {
  const backend = loadBackend()
  const ca = await backend.generateCACertificate()
  const proxy = backend.getLocal({ unixSocketPath: socketPath, https: ca, recordTraffic: false, maxBodySize: 1024 * 1024 })
  const pending = new Map<string, { method: string; host: string; capturedAt: number; started: number }>()
  const allowlist = new Set(hosts)
  let queued = 0
  function finish(id: string, outcome: Pick<TraceRecord, 'status' | 'failure'>) {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (!process.connected || queued >= 32) return
    const { started, ...record } = entry
    queued++
    process.send?.({ record: { ...record, ...outcome, elapsedMs: Math.round(performance.now() - started) } },
      () => { queued-- })
  }
  // The high-level callback matcher buffers the request body before matching.
  // Local rule matchers can check destination metadata while it still streams.
  await proxy.addRequestRules({ matchers: [{
    matches(request) {
      const host = request.destination.hostname.toLowerCase()
      if (request.protocol !== 'https' || !allowlist.has(host)) return false
      if (pending.size < 256 && methodPattern.test(request.method)) {
        pending.set(request.id, { method: request.method, host, capturedAt: Date.now(), started: performance.now() })
      }
      return true
    },
    explain: () => 'for an allowed HTTPS destination',
    dispose: () => pending.clear(),
  }], steps: [new backend.requestSteps.PassThroughStep({ ignoreHostHttpsErrors: false })] })
  await proxy.forUnmatchedRequest().thenReply(403, 'Blocked destination')
  await proxy.on('response-initiated', response => finish(response.id,
    response.tags.some(tag => tag.startsWith('passthrough-error'))
      ? { failure: 'upstream_transport' } : { status: response.statusCode }))
  await proxy.on('abort', request => finish(request.id, { failure: 'connection_aborted' }))
  await proxy.start()
  if (proxy.address !== socketPath) throw new Error('Invalid private listener')
  process.send?.({ caCertificate: ca.cert })
  process.once('message', () => { void proxy.stop().then(() => process.exit(0), () => process.exit(1)) })
}

process.once('disconnect', () => process.exit(0))
process.once('message', (message: unknown) => {
  const input = z.object({ socketPath: z.string(), hosts: z.array(z.string()) }).parse(message)
  void start(input.socketPath, input.hosts).catch(() => process.exit(1))
})
