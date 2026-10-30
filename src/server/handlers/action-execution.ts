import type { ToolPayload } from './payload.js'
import { payloadOf } from './payload.js'
import { correlatedHandler } from './correlation.js'
import { interactionControls } from '../../contracts/execution-controls.js'
import { currentEvidenceActionId, markEvidenceVerification } from '../../observe/evidence.js'
import { measure, withTiming } from '../../utils/timing.js'
import { randomUUID } from 'node:crypto'
import { runWithBudget } from '../../utils/operation-budget.js'
import { validateExpectedState } from '../schemas/condition-schema.js'
import { conditionFailureCode, createConditionalAction, withConditionalAction } from '../../interact/conditional-action.js'
import { resolveTargetDevice, withResolvedDevice } from '../../utils/resolve-device.js'

import { ToolsObserve } from '../../observe/index.js'
import { recordObservationEvent, withObservationContext } from '../../observe/performance-metrics.js'
import {
  buildActionExecutionResult,
  ToolCallArgs,
  ToolHandler,
  wrapResponse,
  wrapToolError
} from '../common.js'
import type { PlatformArg, VerificationMode } from './handler-types.js'

export function compactAction(result: ToolPayload, verificationMode: VerificationMode, started = true, stateDelta?: unknown, totalMs = 0) {
  return {
    action_id: result.action_id,
    action_type: result.action_type,
    success: !!result.success,
    lifecycle_state: result.success ? (verificationMode === 'full' ? result.lifecycle_state : 'pending_verification') : 'failed',
    ...(result.failure_code ? { failure_code: result.failure_code } : {}),
    ...(typeof result.retryable === 'boolean' ? { retryable: result.retryable } : {}),
    delivery_status: result.success ? 'delivered' : (started ? 'unknown' : 'not_delivered'),
    dispatch_started: started,
    verification: { mode: verificationMode, status: result.success ? (verificationMode === 'none' ? 'not_requested' : verificationMode === 'light' ? 'observed' : (result.lifecycle_state === 'verified' ? 'verified' : 'observed')) : 'failed' },
    ...(stateDelta ? { state_delta: stateDelta } : {}),
    timing: { total_ms: totalMs }
  }
}

function createAction(type: string, args: ToolCallArgs, timing: Record<string, number>) {
  const started = performance.now()
  const controls = interactionControls(args)
  const expected = validateExpectedState(type, args)
  const condition = expected ? createConditionalAction(args.platform as PlatformArg, args.deviceId as string, expected) : undefined
  const budgetMs = controls.actionTimeoutMs ?? ({ start_app: 10000, restart_app: 15000, scroll_to_element: 10000 }[type] ?? 5000)
  const unbounded = args._journey !== true && controls.verificationMode === 'full' && controls.responseMode === 'debug' && controls.actionTimeoutMs === undefined
  return { type, args, timing, started, controls, condition, budgetMs, unbounded,
    result: {} as ToolPayload, dispatchStarted: false, blocked: false,
    delta: undefined as unknown, observationAvailable: false }
}
type Action = ReturnType<typeof createAction>
async function dispatchAction(s: Action, execute: ToolHandler) {
  const { type, args, controls, condition, budgetMs } = s
  const dispatchWithBudget = (timeoutMs: number) => runWithBudget(timeoutMs, async (budget) => {
    try {
      if (!condition) return payloadOf(await execute(args))
      return await withConditionalAction(condition, async () => {
        const device = await resolveTargetDevice({ platform: condition.platform, deviceId: condition.deviceId })
        return withResolvedDevice(device, async () => payloadOf(await execute(args)))
      })
    }
    finally { s.dispatchStarted = budget.dispatchStarted }
  })
  try {
    // Omitted controls retain the existing adapter budgets.
    s.result = s.unbounded
      ? await dispatchWithBudget(Infinity) : await dispatchWithBudget(budgetMs)
    if (s.result.success) s.dispatchStarted = true
  } catch (error) {
    if (!condition && controls.verificationMode === 'full' && controls.responseMode === 'debug' && controls.actionTimeoutMs === undefined && !/TIMEOUT|timed out/i.test(String(error))) return wrapToolError(type, error)
    s.result = { success: false, failure_code: /TIMEOUT|timed out/i.test(String(error)) ? 'ACTION_TIMEOUT' : 'UNKNOWN', error: String(error) }
  }
}
function rejectCondition(s: Action) {
  const { condition, type } = s
  s.blocked = !!condition && ['mismatch', 'unavailable'].includes(condition.result.status)
  if (s.blocked && condition) {
    s.dispatchStarted = false
    s.result = buildActionExecutionResult({
      actionType: type, sourceModule: 'server', device: condition.result.observed?.device,
      selector: s.result?.target?.selector ?? null, resolved: s.result?.target?.resolved,
      success: false, uiFingerprintBefore: s.result?.ui_fingerprint_before ?? null, uiFingerprintAfter: null,
      failure: { failureCode: conditionFailureCode(condition), retryable: false },
      traceSteps: [{ stage: 'verify', timestamp: Date.now(), result: 'failure', attempt_index: 0, metadata: { phase: 'precondition', dispatch_started: false } }]
    })
  }
}
function normalizeAction(s: Action) {
  const { type, args, timing, controls } = s
  rejectCondition(s)
  if (s.result.failure_code === 'TIMEOUT' || /ACTION_TIMEOUT|timeout/i.test(String(s.result.error ?? s.result.reason ?? s.result.details?.error ?? ''))) s.result.failure_code = 'ACTION_TIMEOUT'
  if (s.result.failure_code === 'ACTION_TIMEOUT') s.result.retryable = !s.dispatchStarted
  if (!s.result.success && typeof s.result.retryable !== 'boolean') s.result.retryable = !s.dispatchStarted
  s.result.action_id ??= currentEvidenceActionId() ?? randomUUID()
  s.result.action_type ??= type
  recordObservationEvent({
    step_id: args._stepId as string | undefined,
    action_type: type,
    dispatch_ms: timing.dispatch_ms,
    verification_mode: controls.verificationMode,
    dispatch_started: s.dispatchStarted
  })
}
async function verifyAction(s: Action) {
  const { args, controls } = s
  if (s.result.success && controls.verificationMode === 'light') {
    const verificationStarted = performance.now()
    const tree = await withObservationContext({ stepId: args._stepId as string | undefined, purpose: 'verification' }, () =>
      measure('post_observation_ms', () => runWithBudget(controls.verificationTimeoutMs, () =>
        ToolsObserve.getUITreeHandler({ platform: (args.platform as PlatformArg | undefined) ?? (s.result.device?.platform as PlatformArg | undefined), deviceId: (args.deviceId as string | undefined) ?? s.result.device?.id })))).catch(() => null)
    markEvidenceVerification()
    s.observationAvailable = !!tree && !tree.error
    recordObservationEvent({
      verification_budget_ms: controls.verificationTimeoutMs,
      verification_elapsed_ms: performance.now() - verificationStarted,
      verification_outcome: s.observationAvailable ? 'observed' : 'unavailable',
      verification_budget_expired: !s.observationAvailable && performance.now() - verificationStarted >= controls.verificationTimeoutMs
    })
    if (s.observationAvailable && tree?.device) s.delta = ToolsObserve.getLatestStateDelta(tree.device.platform, tree.device.id) ?? undefined
  }
  if (!s.blocked && controls.verificationMode === 'full' && s.dispatchStarted) markEvidenceVerification()
}
function actionResponse(s: Action) {
  const { timing, started, controls, condition, budgetMs } = s
  const compact = compactAction(s.result, controls.verificationMode, s.dispatchStarted, s.delta, performance.now() - started)
  if (s.blocked) compact.verification.status = 'not_requested'
  if (s.result.success && controls.verificationMode === 'light' && !s.observationAvailable) compact.verification.status = 'unavailable'
  const evidence = {
    ...compact,
    ...(condition ? { condition: controls.responseMode === 'compact' && condition.result.status === 'matched'
      ? { ...condition.result, observed: condition.result.observed ? {
        snapshot_session_id: condition.result.observed.snapshot_session_id,
        snapshot_revision: condition.result.observed.snapshot_revision,
        captured_at_ms: condition.result.observed.captured_at_ms
      } : null } : condition.result } : {}),
    ...(controls.verificationMode === 'light' ? { state_delta_available: !!s.delta } : {}),
    ...(s.result.success && controls.verificationMode === 'light' && !s.observationAvailable ? { verification_diagnostic: { code: 'VERIFICATION_UNAVAILABLE', retryable: true } } : {})
  }
  return wrapResponse(controls.responseMode === 'compact' ? evidence : {
    ...s.result, ...evidence, timing: { ...timing, total_ms: performance.now() - started },
    effective_controls: { ...controls, actionTimeoutMs: s.unbounded ? null : budgetMs, timeout_bound: !(s.unbounded) }
  }, controls.responseMode === 'debug')
}

export function actionHandler(type: string, execute: ToolHandler): ToolHandler {
  return correlatedHandler(type, async args => {
    const timing: Record<string, number> = {}
    return withTiming(timing, async () => {
      const state = createAction(type, args, timing)
      const error = await dispatchAction(state, execute)
      if (error) return error
      normalizeAction(state)
      await verifyAction(state)
      return actionResponse(state)
    })
  }, true)
}
export { interactionControls, correlatedHandler, payloadOf }
