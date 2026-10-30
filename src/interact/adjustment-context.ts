import type { ActionFailureCode, ActionTargetResolved, AdjustControlResponse, DeviceInfo, FindElementResponse, TraceStep } from '../types.js'
import type { UiSelector } from '../contracts/selector.js'
import type { UiElement, ResolvedUiElementContext } from './model.js'
import type { InputService } from './input-service.js'
import type { AdjustmentVerificationDependencies } from './adjustment-verification.js'
import { createTraceStep, buildActionExecutionResult } from '../runtime/action-results.js'
import { completeAdjustment } from './adjustment-result.js'
import { planAdjustment } from './adjustment-plan.js'

export interface AdjustmentInput { selector?: UiSelector; element_id?: string; property?: string; targetValue: number; tolerance?: number; maxAttempts?: number; platform?: 'android' | 'ios'; deviceId?: string }
export interface ControlTree { elements?: UiElement[]; device?: DeviceInfo }
export type Match = { el: UiElement; idx: number }
export interface ControlMatch { tree: ControlTree | null; device?: DeviceInfo; match: Match | null; resolvedTarget: ActionTargetResolved | null }
export interface ControlWait { status?: string; element?: { elementId?: string | null } | null; device?: DeviceInfo; error?: { code?: string; message?: string } }
export interface AdjustmentDependencies {
  observe(platform: 'android' | 'ios', deviceId?: string): Promise<ControlTree>
  fingerprint(platform: 'android' | 'ios', deviceId?: string): Promise<string | null>
  getHandle(id: string): ResolvedUiElementContext | undefined
  currentHandle(elements: UiElement[], platform: 'android' | 'ios', deviceId: string | undefined, handle: ResolvedUiElementContext): { el: UiElement; index: number } | null
  target(platform: 'android' | 'ios', deviceId: string | undefined, match: Match): ActionTargetResolved
  wait(input: { selector: UiSelector; condition: 'clickable'; timeout_ms: number; poll_interval_ms: number; platform: 'android' | 'ios'; deviceId?: string }): Promise<ControlWait | undefined>
  find(input: { query: string; exact: boolean; timeoutMs: number; platform: 'android' | 'ios'; deviceId?: string }): Promise<FindElementResponse>
  expectState: AdjustmentVerificationDependencies['expectState']
  service(platform: 'android' | 'ios', deviceId?: string): Promise<{ interact: Pick<InputService, 'setAdjustableValue' | 'adjustAccessibleValue'>; resolved: { id: string } }>
  tap(input: { platform: 'android' | 'ios'; x: number; y: number; deviceId?: string }): Promise<{ success: boolean; device?: DeviceInfo }>
  swipe(input: { platform: 'android' | 'ios'; x1: number; y1: number; x2: number; y2: number; duration: number; deviceId?: string }): Promise<{ success: boolean; device?: DeviceInfo; error?: string }>
}
export type ActualState = AdjustControlResponse['actual_state']
export type Mode = AdjustControlResponse['adjustment_mode']
export type Verification = { verification: { reason?: string } | null; observedState: ActualState; withinTolerance: boolean }
export interface AdjustmentState {
  input: AdjustmentInput & { property: string }
  platform: 'android' | 'ios'; deviceId?: string; stored: ResolvedUiElementContext | null
  selector: Record<string, unknown> | null; tolerance: number | null; limit: number; before: string | null
  fallback: FindElementResponse['element'] | null; trace: TraceStep[]; sequence: number
  observed: ActualState; mode: Mode; target: ActionTargetResolved | null; device?: DeviceInfo
  attempts: number; cached: Match | null; coordinatePending: boolean
}
export type Iteration = ReturnType<typeof planAdjustment> & {
  element: UiElement; index: number; actionDevice?: DeviceInfo; observed: ActualState; verification: Verification
}
export type StrategyOutcome = 'next' | 'retry' | AdjustControlResponse

export async function createAdjustment(input: AdjustmentInput, deps: AdjustmentDependencies): Promise<AdjustmentState> {
  const platform = input.platform || 'android'
  const tolerance = typeof input.tolerance === 'number' && Number.isFinite(input.tolerance) ? Math.max(0, input.tolerance) : null
  const limit = input.maxAttempts == null ? 5 : Math.max(1, Math.floor(Number(input.maxAttempts) || 1))
  const stored = input.element_id ? deps.getHandle(input.element_id) ?? null : null
  const before = await deps.fingerprint(platform, input.deviceId)
  return { input: { ...input, property: input.property === undefined ? 'value' : input.property }, platform, deviceId: input.deviceId, stored,
    selector: input.selector ?? (input.element_id ? { elementId: input.element_id } : null), tolerance, limit, before,
    fallback: null, trace: [], sequence: 0, observed: null, mode: 'gesture', target: null,
    attempts: 0, cached: null, coordinatePending: false }
}
export function recordAdjustment(s: AdjustmentState, stage: TraceStep['stage'], result: TraceStep['result'], metadata?: Record<string, unknown>) {
  s.trace.push(createTraceStep({ stage, timestamp: Date.now(), result, attemptIndex: s.sequence++, metadata }))
}
export function failAdjustment(s: AdjustmentState, code: ActionFailureCode, reason: string, retryable = false,
  target = s.target, device = s.device, observed = s.observed, attempts = s.attempts, mode: Mode = s.mode, after: string | null = null): AdjustControlResponse {
  if (!s.trace.some(step => step.stage === 'resolve')) recordAdjustment(s, 'resolve', 'failure', { reason, failure_code: code })
  if (!s.trace.some(step => step.stage === 'recover')) recordAdjustment(s, 'recover', retryable ? 'retry' : 'failure', {
    reason, failure_code: code, retry_allowed: retryable, recovery_attempts: attempts, retry_depth: attempts })
  const tolerance = s.tolerance ?? 0
  const base = buildActionExecutionResult({ actionType: 'adjust_control', sourceModule: 'interact', device,
    selector: s.selector, resolved: target, success: false, uiFingerprintBefore: s.before, uiFingerprintAfter: after,
    failure: { failureCode: code, retryable }, traceSteps: s.trace,
    details: { target_value: s.input.targetValue, tolerance, property: s.input.property, attempts,
      adjustment_mode: mode, actual_state: observed, converged: false, within_tolerance: false, reason } })
  return { ...base, target_state: { property: s.input.property, target_value: s.input.targetValue, tolerance },
    actual_state: observed, within_tolerance: false, converged: false, attempts, adjustment_mode: mode }
}
export async function succeedAdjustment(s: AdjustmentState, p: Iteration, deps: AdjustmentDependencies,
  reason = 'control converged to target value', mode = s.mode, device = p.actionDevice ?? s.device) {
  const after = await deps.fingerprint(s.platform, s.deviceId)
  return completeAdjustment({ actionType: 'adjust_control', sourceModule: 'interact', device,
    selector: s.selector, resolved: s.target, success: true, uiFingerprintBefore: s.before, uiFingerprintAfter: after,
    traceSteps: s.trace, details: { target_value: p.normalizedTargetValue, tolerance: p.effectiveTolerance,
      property: s.input.property, attempts: s.attempts, adjustment_mode: mode, actual_state: p.observed,
      converged: true, within_tolerance: true, reason } })
}
