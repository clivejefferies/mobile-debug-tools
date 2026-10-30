import type { UiTree } from './observation.js'
import { remainingBudget } from '../utils/operation-budget.js'
import { checkDebuggerGuard } from '../debugger/guard.js'
import { observeReadinessWait, isDeviceUnavailable } from '../observe/readiness.js'
import { readinessDelay } from '../observe/readiness-service.js'
import { matchingElements, evaluateCondition } from './ui-wait-condition.js'
import { createUIWait, validateUIWait, waitObserved, waitFailure,
  type UIWaitInput, type UIWaitDependencies, type UIWaitState, type UIWaitResult } from './ui-wait-state.js'

async function delay(s: UIWaitState, ms: number) {
  await (s.tracker ? readinessDelay(ms) : new Promise(resolve => setTimeout(resolve, ms)))
}
function acceptObservation(s: UIWaitState, tree: UiTree, now: number): UIWaitResult | null {
  const age = typeof tree?.captured_at_ms === 'number' ? now - tree.captured_at_ms : null
  if (!(s.met && (age === null || age <= 500))) { s.stable = 0; return null }
  s.stable++
  if (s.stable < (s.args.singleObservation ? 1 : 2) || (s.tracker && s.tracker.summary.state !== 'settled')) return null
  return { status: 'success', ...(s.args.singleObservation ? { _tree: tree } : {}), matched: s.count,
    element: s.element, metrics: { latency_ms: now - s.start, poll_count: s.polls, attempts: s.attempts }, requested: s.requested, observed: waitObserved(s, true) }
}
function inspectObservation(s: UIWaitState, tree: UiTree, deps: UIWaitDependencies): UIWaitResult | null {
  const a = s.args, elements = tree && Array.isArray(tree.elements) ? tree.elements : []
  const matches = matchingElements(elements, a.selector!)
  if (a.rejectAmbiguous && matches.length > 1 && a.match?.index === undefined) return { status: 'timeout', error: { code: 'AMBIGUOUS_TARGET' } }
  const index = typeof a.match?.index === 'number' ? a.match.index : undefined
  const condition = evaluateCondition(elements, matches, a.condition, index, a.resolveTapTarget)
  const platform = tree?.device?.platform === 'ios' ? 'ios' : a.platform || 'android'
  const deviceId = tree?.device?.id || a.deviceId
  s.count = matches.length; s.met = condition.met
  s.element = condition.element ? deps.resolve(platform, deviceId, condition.element.el, condition.element.idx) : null
  return acceptObservation(s, tree, Date.now())
}
function pollError(s: UIWaitState, error: unknown) {
  checkDebuggerGuard()
  if (error instanceof Error && error.message === 'ACTION_TIMEOUT') throw error
  if (s.tracker && !String(error).includes('READINESS_')) s.tracker.unavailable()
  if (s.tracker && isDeviceUnavailable(error)) throw error
  if (!s.tracker) console.warn('waitForUI: poll error (non-fatal):', error instanceof Error ? error.message : String(error))
}
async function poll(s: UIWaitState, deps: UIWaitDependencies): Promise<UIWaitResult | null> {
  remainingBudget(); s.polls++
  try {
    const started = Date.now(), a = s.args
    const tree = await deps.observe({ platform: a.platform, deviceId: a.deviceId })
    observeReadinessWait(tree, started)
    if (a.resolveTapTarget && tree?.error && /ACTION_TIMEOUT|timed out/i.test(String(tree.error))) throw new Error('ACTION_TIMEOUT')
    return inspectObservation(s, tree, deps)
  } catch (error) { pollError(s, error) }
  return null
}
async function runAttempts(s: UIWaitState, deps: UIWaitDependencies): Promise<UIWaitResult | undefined> {
  const a = s.args
  const interval = Math.max(50, Math.min(a.poll_interval_ms || 300, 2000))
  const maximum = a.retry && a.retry.max_attempts ? Math.max(1, a.retry.max_attempts) : 1
  const backoff = a.retry && a.retry.backoff_ms ? Math.max(0, a.retry.backoff_ms) : 0
  while (s.attempts < maximum) {
    s.attempts++
    const deadline = Date.now() + (a.timeout_ms || 0)
    while (Date.now() <= deadline || (a.singleAttempt && s.polls === 0)) {
      const result = await poll(s, deps)
      if (result) return result
      if (a.singleAttempt) break
      await delay(s, interval || 50)
    }
    if (s.attempts < maximum) { if (backoff > 0) await delay(s, backoff); continue }
    const note = s.requestedIndex !== null && s.count <= s.requestedIndex
      ? ` requested match.index=${s.requestedIndex} but observed ${s.count} match(es)` : ` observed ${s.count} match(es)`
    return waitFailure(s, s.tracker ? 'TIMEOUT' : 'ELEMENT_NOT_FOUND', `Condition ${a.condition} not satisfied within timeout;${note}`, waitObserved(s))
  }
}
export async function waitForUI(input: UIWaitInput, deps: UIWaitDependencies) {
  const state = createUIWait(input)
  const invalid = validateUIWait(state)
  if (invalid) return invalid
  try { return await runAttempts(state, deps) }
  catch (error) {
    checkDebuggerGuard()
    if (!state.tracker && error instanceof Error && error.message === 'ACTION_TIMEOUT') throw error
    if (state.tracker && isDeviceUnavailable(error)) throw error
    return waitFailure(state, state.tracker && String(error).includes('ACTION_TIMEOUT') ? 'TIMEOUT' : 'INTERNAL_ERROR',
      state.tracker ? 'Readiness predicate wait did not complete' : error instanceof Error ? error.message : String(error), waitObserved(state, state.tracker ? state.met : false))
  }
}
