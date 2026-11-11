import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

interface Span { stage: string; start_ms: number; end_ms: number }
interface Measurement { id: string; started: number; spans: Span[] }
const measurement = new AsyncLocalStorage<Measurement>()

// Private benchmark diagnostics: no arguments, device IDs or response contents.
export function recordBenchmarkSpan(stage: string, duration: number) {
  const current = measurement.getStore()
  if (!current) return
  const end = performance.now() - current.started
  current.spans.push({ stage, start_ms: Math.max(0, end - duration), end_ms: end })
}

export async function benchmarkSubprocess<T>(operation: () => Promise<T>): Promise<T> {
  return benchmarkStage('subprocess_ms', operation)
}

export async function benchmarkStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  if (!measurement.getStore()) return operation()
  const started = performance.now()
  try { return await operation() }
  finally { recordBenchmarkSpan(stage, performance.now() - started) }
}

export async function withBenchmarkRequest<T>(tool: string, operation: () => Promise<T>): Promise<T> {
  if (process.env.MOBILE_DEBUG_MCP_LATENCY_METRICS !== '1') return operation()
  const current: Measurement = { id: randomUUID(), started: performance.now(), spans: [] }
  return measurement.run(current, async () => {
    let completed = false
    try {
      const result = await operation()
      completed = true
      return result
    } finally {
      process.stderr.write(`${JSON.stringify({ event: 'latency_metric', request_id: current.id,
        tool, handler_completed: completed, elapsed_ms: performance.now() - current.started,
        spans: current.spans })}\n`)
    }
  })
}
