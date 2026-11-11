import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { setTimeout as delay } from 'node:timers/promises'
import { OwnedTransport } from './owned-transport.js'
import { parseMetric, type RequestMetric, type TreeMetric, type RequestSample } from './end-to-end-report.js'

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}
export function validObservation(tool: string, data: Record<string, unknown>, content: unknown, deviceId: string) {
  const treeValid = (value: Record<string, unknown>) => !value.error && Array.isArray(value.elements) && value.elements.length > 0 && object(value.device).id === deviceId
  if (tool === 'get_ui_tree') return treeValid(data)
  if (tool === 'capture_screenshot') return object(data.device).id === deviceId && Array.isArray(content) && content.some(item => {
    const block = object(item)
    return block.type === 'image' && typeof block.data === 'string' && block.data.length > 0
  })
  if (tool === 'capture_debug_snapshot') {
    const raw = object(data.raw)
    return treeValid(object(raw.ui_tree)) && !Object.keys(raw).some(key => key.endsWith('_error') && raw[key])
  }
  return true
}

export class UnsafeMeasurement extends Error {}
export class BenchmarkSession {
  readonly client = new Client({ name: 'end-to-end-latency', version: '1.0' })
  readonly transport: OwnedTransport
  private events: (RequestMetric | TreeMetric)[] = []
  private pending = ''
  private interrupted = new AbortController()
  constructor(readonly deviceId: string, readonly instrumented: boolean, server = 'dist/server.js') {
    this.transport = new OwnedTransport({ ...process.env,
      MOBILE_DEBUG_MCP_LATENCY_METRICS: instrumented ? '1' : '0',
      MOBILE_DEBUG_MCP_UI_TREE_METRICS: instrumented ? '1' : '0'
    }, chunk => {
      this.pending += chunk
      let index: number
      while ((index = this.pending.indexOf('\n')) >= 0) {
        const event = parseMetric(this.pending.slice(0, index))
        if (event) this.events.push(event)
        this.pending = this.pending.slice(index + 1)
      }
      if (this.pending.length > 1024 * 1024) this.pending = ''
    }, [server])
  }

  async connect() { await this.client.connect(this.transport, { timeout: 15000 }) }
  abort() { this.interrupted.abort() }
  async close() { await this.client.close(); await this.transport.close() }

  async call(tool: string, args: Record<string, unknown>, samples: RequestSample[]) {
    if (this.interrupted.signal.aborted) throw new UnsafeMeasurement('INTERRUPTED')
    this.events = []
    const started = performance.now()
    const sample: RequestSample = { tool, elapsed_ms: 0, success: false, metrics: [], tree: [] }
    samples.push(sample)
    try {
      const response = await this.client.callTool({ name: tool,
        arguments: { platform: 'android', deviceId: this.deviceId, ...args }
      }, undefined, { timeout: 300000, signal: this.interrupted.signal })
      sample.elapsed_ms = performance.now() - started
      console.log(`  ${tool}: ${Math.round(sample.elapsed_ms)} ms`)
      sample.response_bytes = Buffer.byteLength(JSON.stringify(response))
      // Stderr and stdout are independent streams. Await the matching metric
      // outside the measured round trip before dispatching the next request.
      const deadline = performance.now() + 1000
      while (this.instrumented && !this.events.some(event => event.event === 'latency_metric') && performance.now() < deadline) await delay(5)
      sample.metrics = this.events.filter((event): event is RequestMetric => event.event === 'latency_metric')
      sample.tree = this.events.filter((event): event is TreeMetric => event.event === 'ui_tree_metric')
      const text = (response.content as { type: string; text?: string }[]).find(item => item.type === 'text')?.text
      const data = JSON.parse(text ?? '{}')
      sample.success = !response.isError && data.success !== false && !data.error && data.status !== 'timeout' && validObservation(tool, data, response.content, this.deviceId)
      if (!sample.success) {
        sample.failure = 'TOOL_OUTCOME_FAILED'
        // Only fixture-generated step IDs and enum-style codes may be saved.
        const step = typeof data.stopped_at_step_id === 'string' ? data.stopped_at_step_id : ''
        if (/^(launch|tap-\d+|assert-\d+)$/.test(step)) sample.failed_step = step
        const failed = Array.isArray(data.steps) ? data.steps.find((value: Record<string, unknown>) => value.id === step) : undefined
        const code = data.failure_code ?? object(object(failed).result).failure_code ?? object(data.error).code
        if (typeof code === 'string' && /^[A-Z][A-Z_]{0,63}$/.test(code)) sample.failure_code = code
        throw new Error(sample.failure)
      }
      if (this.instrumented && (sample.metrics.length !== 1 || sample.metrics[0].tool !== tool)) {
        sample.success = false; sample.failure = 'METRIC_CORRELATION_FAILED'
        throw new UnsafeMeasurement(sample.failure)
      }
      return data as Record<string, unknown>
    } catch (error) {
      if (!sample.elapsed_ms) sample.elapsed_ms = performance.now() - started
      sample.metrics = this.events.filter((event): event is RequestMetric => event.event === 'latency_metric')
      sample.tree = this.events.filter((event): event is TreeMetric => event.event === 'ui_tree_metric')
      if (!sample.failure) {
        sample.failure = this.interrupted.signal.aborted ? 'INTERRUPTED' : 'TRANSPORT_OR_RESPONSE_FAILED'
        throw new UnsafeMeasurement(sample.failure)
      }
      throw error
    }
  }
}
