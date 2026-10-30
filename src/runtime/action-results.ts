import { currentEvidenceActionId } from '../observe/evidence.js'
import type {
  ActionTrace,
  ActionExecutionResult,
  ActionFailureCode,
  ActionTargetResolved,
  FailureClass,
  RecoveryState,
  TraceResult,
  TraceStage,
  TraceStep
} from '../types.js'
import { ToolsObserve } from '../observe/index.js'
import { isConditionBlocked } from '../interact/conditional-action.js'

export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 3
export const DEFAULT_MAX_RETRY_DEPTH = 3

let actionSequence = 0

export function nextActionId(actionType: string, timestamp: number) {
  const current = currentEvidenceActionId()
  if (current) return current
  actionSequence += 1
  return `${actionType}_${timestamp}_${actionSequence}`
}

export async function captureActionFingerprint(platform?: 'android' | 'ios', deviceId?: string): Promise<string | null> {
  if (isConditionBlocked()) return null
  if (!platform) return null
  try {
    const result = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId })
    return result?.fingerprint ?? null
  } catch {
    return null
  }
}

export function createTraceStep({
  stage,
  timestamp,
  result,
  attemptIndex,
  cycleId,
  metadata
}: {
  stage: TraceStage
  timestamp: number
  result: TraceResult
  attemptIndex: number
  cycleId?: number
  metadata?: Record<string, unknown>
}): TraceStep {
  return {
    stage,
    timestamp,
    result,
    attempt_index: attemptIndex,
    ...(cycleId !== undefined ? { cycle_id: cycleId } : {}),
    ...(metadata ? { metadata } : {})
  }
}

export function buildActionTrace({
  actionId,
  actionType,
  sourceModule,
  selector,
  resolved,
  success,
  failure,
  details,
  recovery,
  attempts = 1,
  steps
}: {
  actionId: string
  actionType: string
  sourceModule: 'server' | 'interact'
  selector: Record<string, unknown> | null
  resolved?: Partial<ActionTargetResolved> | null
  success: boolean
  failure?: { failureCode: ActionFailureCode; retryable: boolean }
  details?: Record<string, unknown>
  recovery?: RecoveryState
  attempts?: number
  steps?: TraceStep[]
}): ActionTrace {
  if (steps && steps.length > 0) {
    return {
      action_id: actionId,
      steps,
      final_outcome: success ? 'success' : 'failure',
      attempts: Math.max(1, Math.floor(attempts || steps.length))
    }
  }

  const start = Date.now()
  const builtSteps: TraceStep[] = []
  let attemptIndex = 0
  const totalAttempts = Math.max(1, Math.floor(attempts || 1))

  if (selector || resolved) {
    const stageResult: TraceResult = resolved ? 'success' : 'failure'
    builtSteps.push(createTraceStep({
      stage: 'resolve',
      timestamp: start,
      result: stageResult,
      attemptIndex: attemptIndex++,
      metadata: {
        action_type: actionType,
        source_module: sourceModule,
        selector: selector ?? null,
        resolved: resolved ? normalizeResolvedTarget(resolved) : null
      }
    }))
  }

  builtSteps.push(createTraceStep({
    stage: 'execute',
    timestamp: Date.now(),
    result: success ? 'success' : 'failure',
    attemptIndex: attemptIndex++,
    metadata: {
      action_type: actionType,
      source_module: sourceModule,
      ...(failure ? { failure_code: failure.failureCode, retryable: failure.retryable } : {})
    }
  }))

  appendObservationAndRecoverySteps({ builtSteps, attemptIndex, details, success, failure, recovery })

  if (!builtSteps.length) {
    builtSteps.push(createTraceStep({
      stage: 'execute',
      timestamp: start,
      result: success ? 'success' : 'failure',
      attemptIndex: 0,
      metadata: { action_type: actionType, source_module: sourceModule }
    }))
  }

  return {
    action_id: actionId,
    steps: builtSteps,
    final_outcome: success ? 'success' : 'failure',
    attempts: totalAttempts
  }
}

export function normalizeResolvedTarget(value: Partial<ActionTargetResolved> | null = null): ActionTargetResolved | null {
  if (!value) return null
  return {
    elementId: value.elementId ?? null,
    text: value.text ?? null,
    resource_id: value.resource_id ?? null,
    accessibility_id: value.accessibility_id ?? null,
    class: value.class ?? null,
    bounds: value.bounds ?? null,
    index: value.index ?? null,
    state: value.state ?? null
  }
}

export function inferGenericFailure(message: string | undefined): { failureCode: ActionFailureCode; retryable: boolean } {
  if (message && /timeout/i.test(message)) return { failureCode: 'TIMEOUT', retryable: true }
  if (message && /semantic mismatch/i.test(message)) return { failureCode: 'SEMANTIC_MISMATCH', retryable: false }
  return { failureCode: 'UNKNOWN', retryable: false }
}

export function inferScrollFailure(message: string | undefined): { failureCode: ActionFailureCode; retryable: boolean } {
  if (message && /unchanged|no change|end of list/i.test(message)) return { failureCode: 'NAVIGATION_NO_CHANGE', retryable: true }
  if (message && /timeout/i.test(message)) return { failureCode: 'TIMEOUT', retryable: true }
  return { failureCode: 'UNKNOWN', retryable: false }
}

const ACTION_LIFECYCLE_STATE_BY_OUTCOME = {
  success: 'pending_verification',
  failure: 'failed'
} as const

export function determineActionLifecycleState({
  success,
  failure
}: {
  success: boolean
  failure?: { failureCode: ActionFailureCode; retryable: boolean }
}): NonNullable<ActionExecutionResult['lifecycle_state']> {
  if (failure) return ACTION_LIFECYCLE_STATE_BY_OUTCOME.failure
  if (success) return ACTION_LIFECYCLE_STATE_BY_OUTCOME.success
  return ACTION_LIFECYCLE_STATE_BY_OUTCOME.success
}

function mapFailureCodeToFailureClass(code: ActionFailureCode): FailureClass {
  switch (code) {
    case 'ELEMENT_NOT_FOUND':
    case 'AMBIGUOUS_TARGET':
    case 'STALE_REFERENCE':
      return 'TargetResolutionFailure'
    case 'ELEMENT_NOT_INTERACTABLE':
    case 'PRECONDITION_FAILED':
    case 'PRECONDITION_UNAVAILABLE':
    case 'ACTION_TIMEOUT':
      return 'ExecutionFailure'
    case 'TIMEOUT':
    case 'ACTION_REJECTED':
    case 'NAVIGATION_NO_CHANGE':
    case 'UNKNOWN':
      return 'ExecutionFailure'
    case 'VERIFICATION_FAILED':
    case 'EXPECT_STATE_MISMATCH':
    case 'ASSERTION_TIMEOUT':
      return 'VerificationFailure'
    case 'CONTROL_CONVERGENCE_FAILED':
      return 'ControlConvergenceFailure'
    case 'SEMANTIC_MISMATCH':
      return 'SemanticMismatchFailure'
  }
}

function buildRecoveryState(failureCode: ActionFailureCode, retryable: boolean): RecoveryState {
  return {
    failure_class: mapFailureCodeToFailureClass(failureCode),
    runtime_code: failureCode,
    recovery_attempts: 0,
    max_recovery_attempts: DEFAULT_MAX_RECOVERY_ATTEMPTS,
    retry_depth: 0,
    max_retry_depth: DEFAULT_MAX_RETRY_DEPTH,
    is_terminal: false,
    retry_allowed: retryable
  }
}

export function buildActionExecutionResult({
  actionType,
  device,
  selector,
  resolved,
  success,
  uiFingerprintBefore,
  uiFingerprintAfter,
  failure,
  details,
  sourceModule,
  traceSteps
}: {
  actionType: string
  device?: ActionExecutionResult['device']
  selector: Record<string, unknown> | null
  resolved?: Partial<ActionTargetResolved> | null
  success: boolean
  uiFingerprintBefore: string | null
  uiFingerprintAfter: string | null
  failure?: { failureCode: ActionFailureCode; retryable: boolean }
  details?: Record<string, unknown>
  sourceModule: 'server' | 'interact'
  traceSteps?: TraceStep[]
}): ActionExecutionResult {
  const timestampMs = Date.now()
  const timestamp = new Date(timestampMs).toISOString()
  const actionId = nextActionId(actionType, timestampMs)
  const recoveryState = failure ? buildRecoveryState(failure.failureCode, failure.retryable) : undefined
  const attempts = typeof details?.attempts === 'number' && Number.isFinite(details.attempts)
    ? Math.max(1, Math.floor(details.attempts))
    : 1
  return {
    action_id: actionId,
    timestamp,
    action_type: actionType,
    lifecycle_state: determineActionLifecycleState({ success, failure }),
    source_module: sourceModule,
    ...(device ? { device } : {}),
    target: {
      selector,
      resolved: normalizeResolvedTarget(resolved)
    },
    success,
    ...(failure ? { failure_code: failure.failureCode, retryable: failure.retryable } : {}),
    ...(recoveryState ? { recovery: recoveryState } : {}),
    trace: buildActionTrace({
      actionId,
      actionType,
      sourceModule,
      selector,
      resolved,
      success,
      failure,
      details,
      recovery: recoveryState,
      attempts,
      steps: traceSteps
    }),
    ui_fingerprint_before: uiFingerprintBefore,
    ui_fingerprint_after: uiFingerprintAfter,
    ...(details ? { details } : {})
  }
}


interface TraceStageContext {
  builtSteps: TraceStep[]
  attemptIndex: number
  details?: Record<string, unknown>
  success: boolean
  failure?: { failureCode: ActionFailureCode; retryable: boolean }
  recovery?: RecoveryState
}
function appendObservationAndRecoverySteps(context: TraceStageContext) {
  const attemptIndex = appendStabilizationStep(context)
  const nextIndex = appendVerificationStep({ ...context, attemptIndex })
  appendRecoveryStep({ ...context, attemptIndex: nextIndex })
}
function appendStabilizationStep({ builtSteps, attemptIndex, details, success }: TraceStageContext) {
  const hasStabilizeDetails = Boolean(details && (
    Object.prototype.hasOwnProperty.call(details, 'stabilization_attempts') ||
    Object.prototype.hasOwnProperty.call(details, 'stable_observation_count') ||
    Object.prototype.hasOwnProperty.call(details, 'snapshot_freshness_ms')
  ))
  if (hasStabilizeDetails) {
    builtSteps.push(createTraceStep({
      stage: 'stabilize',
      timestamp: Date.now(),
      result: success ? 'success' : 'failure',
      attemptIndex: attemptIndex++,
      metadata: {
        stabilization_attempts: (details?.stabilization_attempts as number | undefined) ?? null,
        stable_observation_count: (details?.stable_observation_count as number | undefined) ?? null,
        snapshot_freshness_ms: (details?.snapshot_freshness_ms as number | undefined) ?? null
      }
    }))
  }

  return attemptIndex
}
function appendVerificationStep({ builtSteps, attemptIndex, details, success }: TraceStageContext) {
  const hasVerifyDetails = Boolean(details && (
    Object.prototype.hasOwnProperty.call(details, 'within_tolerance') ||
    Object.prototype.hasOwnProperty.call(details, 'converged') ||
    Object.prototype.hasOwnProperty.call(details, 'observed_state')
  ))

  if (hasVerifyDetails) {
    builtSteps.push(createTraceStep({
      stage: 'verify',
      timestamp: Date.now(),
      result: success ? 'success' : 'failure',
      attemptIndex: attemptIndex++,
      metadata: {
        within_tolerance: details?.within_tolerance ?? null,
        converged: details?.converged ?? null,
        actual_state: details?.actual_state ?? null,
        reason: details?.reason ?? null
      }
    }))
  }

  return attemptIndex
}
function appendRecoveryStep({ builtSteps, attemptIndex, failure, recovery }: TraceStageContext) {
  if (failure) {
    builtSteps.push(createTraceStep({
      stage: 'recover',
      timestamp: Date.now(),
      result: failure.retryable ? 'retry' : 'failure',
      attemptIndex: attemptIndex++,
      metadata: {
        failure_class: recovery?.failure_class ?? mapFailureCodeToFailureClass(failure.failureCode),
        runtime_code: failure.failureCode,
        retry_allowed: failure.retryable,
        recovery_attempts: recovery?.recovery_attempts ?? 0,
        retry_depth: recovery?.retry_depth ?? 0
      }
    }))
  }

}
