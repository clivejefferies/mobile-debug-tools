import type { AdjustControlResponse } from '../../types.js'
import { buildActionExecutionResult } from '../../runtime/action-results.js'

type SuccessDetails = {
  property: string
  target_value: number
  tolerance: number
  attempts: number
  adjustment_mode: AdjustControlResponse['adjustment_mode']
  actual_state: AdjustControlResponse['actual_state']
  reason: string
  converged: true
  within_tolerance: true
}
type AdjustmentSuccess = Parameters<typeof buildActionExecutionResult>[0] & { details: SuccessDetails }

/** Keep the action envelope and top-level control result in agreement. */
export function completeAdjustment(input: AdjustmentSuccess): AdjustControlResponse {
  const base = buildActionExecutionResult(input)
  const details = input.details
  return {
    ...base,
    target_state: {
      property: details.property,
      target_value: details.target_value,
      tolerance: details.tolerance
    },
    actual_state: details.actual_state,
    within_tolerance: true,
    converged: true,
    attempts: details.attempts,
    adjustment_mode: details.adjustment_mode
  }
}
