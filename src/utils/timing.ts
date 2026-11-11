import { AsyncLocalStorage } from 'node:async_hooks'
import { recordBenchmarkSpan } from './benchmark-metrics.js'
const timings = new AsyncLocalStorage<Record<string, number>>()
export function withTiming<T>(values: Record<string, number>, operation: () => Promise<T>) { return timings.run(values, operation) }
export function recordTiming(component: string, milliseconds: number) {
  recordBenchmarkSpan(component, milliseconds)
  const values = timings.getStore()
  if (values) values[component] = (values[component] ?? 0) + milliseconds
}
export async function measure<T>(component: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try { return await operation() }
  finally {
    recordTiming(component, performance.now() - start)
  }
}
