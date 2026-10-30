import type { z } from 'zod'
import { debuggerSessions } from '../../debugger/sessions.js'
import { systemTraces } from '../../observe/system-trace.js'
import { currentEvidenceCorrelationId, bindSystemTrace, refreshJourneyEvidence, completeJourneyVerification } from '../../observe/evidence.js'
import { runWithBudget } from '../../utils/operation-budget.js'
import { journeySchema } from '../schemas/journey-schema.js'
import { resolveTargetDevice, withResolvedDevice } from '../../utils/resolve-device.js'
import { ToolsInteract } from '../../interact/index.js'
import { ToolsObserve } from '../../observe/index.js'
import { withObservationContext } from '../../observe/performance-metrics.js'
import { wrapResponse, type ToolCallArgs } from '../common.js'
import { payloadOf, type ToolPayload } from './payload.js'
import { handleStartApp } from './manage.js'
import { handleTapElement } from './input.js'
import { expectElementAbsent, expectFingerprint } from './journey-assertions.js'

type Journey = z.infer<typeof journeySchema>
type Step = Journey['steps'][number]
type AssertionStep = Extract<Step, { type: 'assert' }>
interface StepResult {
  id: string; type: Step['type']; status: string; success: boolean; reason?: string
  result: ToolPayload | null; timing?: { total_ms: number }
}
interface Context {
  input: Journey; deviceId: string; results: StepResult[]; stoppedAt: string | null; pendingLightStep: number | null
}
async function assertStep(step: AssertionStep, platform: Journey['platform'], deviceId: string): Promise<ToolPayload> {
  const assertion = step.assertion
  const timeoutMs = step.timeoutMs ?? 5000, pollIntervalMs = step.pollIntervalMs ?? 100
  if (assertion.kind === 'element_visible') return ToolsInteract.expectElementVisibleHandler({ selector: assertion.selector, timeout_ms: timeoutMs, poll_interval_ms: pollIntervalMs, platform, deviceId })
  if (assertion.kind === 'element_absent') return expectElementAbsent({ selector: assertion.selector, timeoutMs, pollIntervalMs, platform, deviceId })
  if (assertion.kind === 'screen_fingerprint') return expectFingerprint({ fingerprint: assertion.fingerprint, timeoutMs, platform, deviceId })
  if (assertion.kind === 'state_equals') return ToolsInteract.expectStateHandler({ selector: assertion.selector, element_id: assertion.elementId, property: assertion.property, expected: assertion.expected, platform, deviceId, stabilization_window_ms: timeoutMs, poll_interval_ms: pollIntervalMs, exact_budget: true })
  return { success: false, failure_code: 'INVALID_ASSERTION' }
}
async function executeStep(s: Context, step: Step, covered: boolean): Promise<ToolPayload> {
  const { platform, responseMode, defaults } = s.input, deviceId = s.deviceId
  try {
    if (step.type === 'tap') return payloadOf(await handleTapElement({ ...defaults, ...step, platform, deviceId, responseMode, _journey: true, _stepId: step.id, verificationMode: covered ? 'none' : step.verificationMode ?? defaults?.verificationMode ?? 'full' }))
    if (step.type === 'wait') {
      const result = (await withObservationContext({ stepId: step.id, purpose: 'target' }, () => ToolsInteract.waitForUIHandler({ selector: step.selector, condition: step.condition ?? 'exists', timeout_ms: step.timeoutMs ?? 5000, poll_interval_ms: step.pollIntervalMs ?? 100, platform, deviceId })))!
      return { success: result.status === 'success', ...result }
    }
    if (step.type === 'assert') return await withObservationContext({ stepId: step.id, purpose: 'assertion' }, () => runWithBudget(step.timeoutMs ?? 5000, () => assertStep(step, platform, deviceId)))
    if (step.type === 'start_app') return payloadOf(await handleStartApp({ ...defaults, platform, deviceId, appId: step.appId, responseMode, _journey: true, _stepId: step.id, verificationMode: step.verificationMode ?? defaults?.verificationMode ?? 'full' }))
    return { success: false, failure_code: 'UNSUPPORTED_JOURNEY_STEP' }
  } catch (error) {
    return { success: false, failure_code: step.type === 'assert' ? 'ASSERTION_TIMEOUT' : 'STEP_FAILED', error: error instanceof Error ? error.message : String(error) }
  }
}
function lightVerification(s: Context, step: Step, result: ToolPayload, covered: boolean, success: boolean) {
  if (covered) {
    result.verification = { mode: 'light', status: success ? 'unavailable' :
      (['mismatch', 'unavailable'].includes(result.condition?.status ?? '') ? 'not_requested' : 'failed') }
    if (success) {
      result.verification_diagnostic = { code: 'VERIFICATION_UNAVAILABLE', retryable: true }
      s.pendingLightStep = s.results.length
    }
  }
  if (step.type !== 'assert' || s.pendingLightStep === null) return
  const pending = s.results[s.pendingLightStep].result!
  if (typeof result.observed?.matched_count === 'number') {
    pending.verification!.status = 'observed'
    if (pending.evidence) completeJourneyVerification(pending.evidence.action_id!)
    delete pending.verification_diagnostic
    const delta = ToolsObserve.getLatestStateDelta(s.input.platform, s.deviceId)
    if (delta) { pending.state_delta = delta; pending.state_delta_available = true }
  }
  s.pendingLightStep = null
}
function compactAssertion(result: ToolPayload, success: boolean) {
  const errorCode = typeof result.error === 'object' ? result.error?.code : undefined
  return { success, ...(result.failure_code ? { failure_code: result.failure_code } : {}),
    ...(errorCode ? { failure_code: errorCode } : {}),
    ...(result.observed?.matched_count !== undefined ? { matched_count: result.observed.matched_count } : {}),
    ...(result.observed_fingerprint !== undefined ? { matched: success } : {}),
    ...(result.actual_state ? { observed: result.actual_state } : {}) }
}
function coveredByAssertion(s: Context, step: Step, next?: Step) {
  const verification = ('verificationMode' in step ? step.verificationMode : undefined) ?? s.input.defaults?.verificationMode ?? 'full'
  return step.type === 'tap' && s.input.responseMode === 'compact' && verification === 'light' && next?.type === 'assert' && next.assertion.kind === 'element_visible'
}
async function runSteps(s: Context) {
  const { platform, responseMode, steps } = s.input
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    if (platform === 'android' && debuggerSessions.paused(s.deviceId)) {
      s.results.push({ id: step.id, type: step.type, status: 'failed', success: false, result: { success: false, failure_code: 'DEBUGGER_PAUSED', dispatch_started: false, delivery_status: 'not_delivered' } })
      s.stoppedAt = step.id
      break
    }
    const covered = coveredByAssertion(s, step, steps[index + 1]), started = performance.now()
    if (s.stoppedAt) {
      s.results.push({ id: step.id, type: step.type, status: 'not_run', success: false, reason: 'PREVIOUS_STEP_FAILED', result: null, timing: { total_ms: 0 } })
      continue
    }
    let result = await executeStep(s, step, covered)
    if (platform === 'android' && debuggerSessions.paused(s.deviceId)) { result.success = false; result.failure_code = 'DEBUGGER_PAUSED'; result.retryable = false }
    if (step.type === 'assert' && !result?.success && /TIMEOUT/.test(result?.failure_code ?? '')) result.failure_code = 'ASSERTION_TIMEOUT'
    const success = !!result?.success
    lightVerification(s, step, result, covered, success)
    if (responseMode === 'compact' && ['wait', 'assert'].includes(step.type)) result = compactAssertion(result, success)
    s.results.push({ id: step.id, type: step.type, status: success ? 'passed' : 'failed', success, result, timing: { total_ms: performance.now() - started } })
    if (!success) s.stoppedAt = step.id
  }
}
async function journeyResponse(s: Context, started: number, finishTrace?: () => Promise<unknown>) {
  const { platform, captureOnFailure, responseMode } = s.input
  const failureSnapshot = s.stoppedAt && captureOnFailure && responseMode === 'debug'
    ? await ToolsObserve.captureDebugSnapshotHandler({ platform, deviceId: s.deviceId, includeScreenshot: false }).catch(() => null) : undefined
  const timing: Record<string, number> = {}
  for (const step of s.results) for (const [key, value] of Object.entries(step.result?.timing ?? {})) {
    if (key !== 'total_ms' && typeof value === 'number') timing[key] = (timing[key] ?? 0) + value
  }
  refreshJourneyEvidence(s.results)
  return wrapResponse({ ...(finishTrace ? { system_trace: await finishTrace() } : {}), success: s.stoppedAt === null, stopped_at_step_id: s.stoppedAt, steps: s.results, ...(failureSnapshot ? { failure_snapshot: failureSnapshot } : {}), timing: responseMode === 'compact' ? { total_ms: performance.now() - started } : { ...timing, total_ms: performance.now() - started } }, responseMode === 'debug')
}
export async function handleRunJourney(args: ToolCallArgs) {
  const parsed = journeySchema.safeParse(args)
  if (!parsed.success) throw new Error(`INVALID_ARGUMENT: ${parsed.error.message}`)
  const device = await resolveTargetDevice({ platform: parsed.data.platform, deviceId: parsed.data.deviceId })
  const finishTrace = parsed.data.systemTraceId ? await systemTraces.link(parsed.data.systemTraceId, device, currentEvidenceCorrelationId()!) : undefined
  if (parsed.data.systemTraceId) bindSystemTrace(parsed.data.systemTraceId)
  try {
    return await withResolvedDevice(device, async () => {
      const started = performance.now()
      const state: Context = { input: parsed.data, deviceId: device.id, results: [], stoppedAt: null, pendingLightStep: null }
      await runSteps(state)
      return journeyResponse(state, started, finishTrace)
    })
  } finally { await finishTrace?.() }
}
