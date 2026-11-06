import { evidenceSessionId } from '../../observe/evidence.js'
import { interactionDiagnostics } from './interaction-diagnostics.js'
import { object, pick, boundedValue, boundedState, observedState, deltaSummary, type Payload } from './compact-state.js'
import type { ToolCallArgs, ToolCallResult } from '../common.js'

export const compactInteractionTools = new Set(['start_app', 'restart_app', 'tap', 'tap_element', 'swipe', 'scroll_to_element', 'type_text', 'press_back', 'run_journey'])
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
// IDs are preserved verbatim; their allowance counts the UTF-8 wire encoding.
const idBytes = (value: unknown) => bytes(String(value ?? '')) - 2
const deviceBytes = (evidence: unknown) => idBytes(object(object(evidence).device).id)
function compactEvidence(value: unknown) {
  const e = object(value)
  return { ...pick(e, ['session_id', 'correlation_id', 'action_id', 'device']),
    ...(e.association_reason ? pick(e, ['association', 'association_reason']) : {}),
    ...(object(e.trace_context).trace_id ? { trace_id: object(e.trace_context).trace_id } : {}) }
}
function conditionSummary(value: unknown) {
  const c = object(value)
  return { ...pick(c, ['status', 'reason']), observed: c.observed == null ? null : pick(c.observed, ['snapshot_session_id', 'snapshot_revision', 'captured_at_ms']) }
}
function addCompactError(result: Payload, error: unknown, name: string) {
  const message = typeof error === 'string' ? error : object(error).message
  result.error = { ...pick(error, ['code']), message: boundedValue(message) }
  result.action_type ??= name
  result.verification ??= { status: 'unavailable' }
  if (object(result.error).message !== message) result.truncated = true
}
function compactResult(source: Payload, name: string, limit = 1280): Payload {
  const evidence = object(source.evidence)
  const result: Payload = {
    ...pick(source, ['action_id', 'action_type', 'success', 'lifecycle_state', 'failure_code', 'retryable', 'delivery_status', 'dispatch_started', 'verification', 'verification_diagnostic', 'state_delta_available']),
    observed_state: !['wait', 'assert'].includes(name) && source.dispatch_started !== true
      ? { status: 'unknown', reason: 'NO_POST_ACTION_OBSERVATION' } : observedState(evidence, source.dispatch_started === true),
    evidence: compactEvidence(evidence), diagnostics: interactionDiagnostics.retain(source)
  }
  result.success ??= false
  result.verification ??= { status: source.dispatch_started === false ? 'not_requested' : 'unavailable' }
  if (source.error) addCompactError(result, source.error, name)
  if (source.device_readiness) result.device_readiness = pick(source.device_readiness, ['wakefulness', 'lock_state', 'input_ready', 'blockers', 'limitations'])
  if (source.condition) result.condition = conditionSummary(source.condition)
  if (source.state_delta) result.state_delta = deltaSummary(source.state_delta)
  if (source.timing) result.timing = pick(source.timing, ['total_ms'])
  if (object(source.observed).matched_count !== undefined) result.matched_count = object(source.observed).matched_count
  if (source.observed_fingerprint !== undefined) result.matched = !!source.success
  const state = source.actual_state !== undefined ? source.actual_state : source.observed_state
  if (state !== undefined) {
    result.observed = boundedState(state)
    if (JSON.stringify(result.observed) !== JSON.stringify(state)) result.truncated = true
  }
  result.evidence = { session_id: evidenceSessionId(), ...object(result.evidence) }
  enforceBudget(result, limit + deviceBytes(evidence))
  return result
}
function enforceBudget(result: Payload, limit: number) {
  if (bytes(result) <= limit) return
  result.truncated = true
  for (const key of ['state_delta', 'observed', 'matched_count', 'matched', 'state_delta_available', 'timing']) {
    delete result[key]
    if (bytes(result) <= limit) return
  }
  if (result.condition) result.condition = pick(result.condition, ['status', 'reason'])
  result.observed_state = { status: 'unknown', reason: 'OMITTED' }
  if (result.failure_code) delete result.error
  else if (result.error) result.error = pick(result.error, ['code'])
}
function compactJourney(source: Payload): Payload {
  const steps = Array.isArray(source.steps) ? source.steps.map(object) : []
  const result: Payload = { ...pick(source, ['stopped_at_step_id']), success: source.success === true,
    evidence: compactEvidence(source.evidence), diagnostics: interactionDiagnostics.retain(source),
    observed_state: observedState(source.evidence), timing: pick(source.timing, ['total_ms']),
    steps: steps.map(step => ({ ...pick(step, ['id', 'type', 'status', 'success', 'reason']),
      result: step.result ? compactResult(object(step.result), String(step.type), 1080) : null })) }
  if (source.error) {
    const message = object(source.error).message
    const bounded = boundedValue(message)
    result.error = { ...pick(source.error, ['code']), message: bounded }
    if (bounded !== message) result.truncated = true
  }
  if (source.system_trace) result.system_trace = pick(source.system_trace, ['trace_id', 'state', 'coverage', 'clock_alignment'])
  enforceBudget(result, 1280 + 1280 * steps.length + steps.reduce((sum, s) => sum + idBytes(s.id) + deviceBytes(object(s.result).evidence), 0) + idBytes(source.stopped_at_step_id) + deviceBytes(source.evidence))
  return result
}
export function finalizeCompactInteraction(name: string, args: ToolCallArgs, response: ToolCallResult) {
  if (!compactInteractionTools.has(name) || (args.responseMode ?? (name === 'run_journey' ? 'compact' : 'debug')) !== 'compact') return response
  const item = response.content.find(item => item.type === 'text')
  if (item?.text) {
    const source = object(JSON.parse(item.text))
    item.text = JSON.stringify(name === 'run_journey' ? compactJourney(source) : compactResult(source, name))
  }
  return response
}
