import { systemClock, type Clock } from '../runtime/clock.js'
import type { ActionTrace, TraceStep } from '../types.js'
import { createTraceStep, nextActionId } from '../runtime/action-results.js'

export function buildObservationTrace({
  actionType,
  stage,
  success,
  attempts,
  metadata
}: {
  actionType: string
  stage: 'verify' | 'stabilize' | 'resolve'
  success: boolean
  attempts: number
  metadata?: Record<string, unknown>
}, clock: Clock = systemClock): ActionTrace {
  const now = clock.now()
  const actionId = nextActionId(actionType, now)
  const steps: TraceStep[] = [
    createTraceStep({
      stage,
      timestamp: now,
      result: success ? 'success' : 'failure',
      attemptIndex: 0,
      metadata
    })
  ]

  return {
    action_id: actionId,
    steps,
    final_outcome: success ? 'success' : 'failure',
    attempts: Math.max(1, Math.floor(attempts || 1))
  }
}
