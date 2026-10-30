import type { ActionExecutionResult, DeviceInfo, ActionConditionResult, TimingBreakdown } from '../../types.js'
import type { ToolCallResult } from '../common.js'

// Internal decoded MCP payloads vary by capability. Keep the fields inspected by
// orchestration explicit while preserving untouched capability-specific fields.
export interface ToolPayload {
  success?: boolean
  action_id?: string
  action_type?: string
  lifecycle_state?: string
  failure_code?: string
  retryable?: boolean
  device?: DeviceInfo
  target?: ActionExecutionResult['target']
  ui_fingerprint_before?: string | null
  error?: string | { code?: string; message?: string }
  reason?: string
  details?: { error?: unknown }
  dispatch_started?: boolean
  delivery_status?: string
  state_delta?: unknown
  state_delta_available?: boolean
  actual_state?: unknown
  observed_fingerprint?: string | null
  status?: string
  condition?: ActionConditionResult
  verification?: { mode?: string; status: string }
  evidence?: { action_id?: string }
  verification_diagnostic?: { code: string; retryable: boolean }
  observed?: { matched_count?: number | null }
  timing?: TimingBreakdown
}
export function payloadOf(response: ToolCallResult): ToolPayload {
  const text = response.content.find(item => item.type === 'text')?.text
  return text ? JSON.parse(text) as ToolPayload : null as unknown as ToolPayload
}
