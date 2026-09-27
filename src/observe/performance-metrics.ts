import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

export type ObservationPurpose = 'target' | 'verification' | 'assertion' | 'debug' | 'unspecified'

interface ObservationContext {
  stepId?: string
  purpose: ObservationPurpose
}

const context = new AsyncLocalStorage<ObservationContext>()
const observationIds = new WeakMap<object, string>()

export function withObservationContext<T>(value: Partial<ObservationContext>, operation: () => Promise<T>): Promise<T> {
  if (process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS !== '1') return operation()
  return context.run({ purpose: value.purpose ?? context.getStore()?.purpose ?? 'unspecified', stepId: value.stepId ?? context.getStore()?.stepId }, operation)
}

export function recordObservationEvent(event: Record<string, unknown>) {
  if (process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS !== '1') return
  const current = context.getStore()
  process.stderr.write(`${JSON.stringify({
    event: 'ui_tree_metric',
    host_monotonic_ns: process.hrtime.bigint().toString(),
    type: 'action_observation',
    step_id: current?.stepId,
    purpose: current?.purpose ?? 'unspecified',
    ...event
  })}\n`)
}

export function recordObservationConsumer(observation: unknown, purpose: ObservationPurpose, stepId?: string) {
  if (process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS !== '1' || !observation || typeof observation !== 'object') return
  const acquisitionId = observationIds.get(observation)
  if (!acquisitionId) return
  const current = context.getStore()
  process.stderr.write(`${JSON.stringify({
    event: 'ui_tree_metric',
    host_monotonic_ns: process.hrtime.bigint().toString(),
    type: 'observation_consumer',
    acquisition_id: acquisitionId,
    consumer_step_id: stepId ?? current?.stepId,
    consumer_purpose: purpose,
    reused_observations: 1
  })}\n`)
}

export function createObservationMeasurement(platform: 'android' | 'ios') {
  const enabled = process.env.MOBILE_DEBUG_MCP_UI_TREE_METRICS === '1'
  const startedAt = enabled ? performance.now() : 0
  const id = enabled ? randomUUID() : undefined
  const current = context.getStore()
  const durations: Record<string, number> = {}
  let successfulOutput = false
  let outcome: 'observed' | 'unavailable' = 'unavailable'
  let readAttempt = 0

  const emit = (event: Record<string, unknown>) => {
    if (!enabled) return
    process.stderr.write(`${JSON.stringify({
      event: 'ui_tree_metric',
      host_monotonic_ns: process.hrtime.bigint().toString(),
      acquisition_id: id,
      platform,
      step_id: current?.stepId,
      purpose: current?.purpose ?? 'unspecified',
      ...event
    })}\n`)
  }

  return {
    id,
    bindObservation<T extends object>(observation: T): T {
      if (enabled && id) observationIds.set(observation, id)
      return observation
    },
    timed: async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
      if (!enabled) return operation()
      const start = performance.now()
      let success = true
      try {
        return await operation()
      } catch (error) {
        success = false
        throw error
      } finally {
        const elapsed = performance.now() - start
        durations[stage] = (durations[stage] ?? 0) + elapsed
        emit({ type: 'stage', stage, attempt_index: stage === 'parse_ms' ? readAttempt : undefined, elapsed_ms: elapsed, success })
      }
    },
    physicalRead: async <T>(operation: () => Promise<T>): Promise<T> => {
      if (!enabled) return operation()
      const start = performance.now()
      readAttempt++
      emit({ type: 'physical_read_started', attempt_index: readAttempt })
      try {
        const result = await operation()
        successfulOutput = true
        emit({ type: 'physical_read_completed', attempt_index: readAttempt, elapsed_ms: performance.now() - start, success: true })
        return result
      } catch (error) {
        emit({ type: 'physical_read_completed', attempt_index: readAttempt, elapsed_ms: performance.now() - start, success: false })
        throw error
      }
    },
    setOutcome(value: 'observed' | 'unavailable') { if (enabled) outcome = value },
    finish() {
      if (!enabled) return
      emit({
        type: 'observation_consumer',
        consumer_step_id: current?.stepId,
        consumer_purpose: current?.purpose ?? 'unspecified',
        reused_observations: 0
      })
      emit({
        type: 'acquisition_completed',
        elapsed_ms: performance.now() - startedAt,
        successful_output: successfulOutput,
        outcome,
        durations_ms: durations
      })
    }
  }
}
