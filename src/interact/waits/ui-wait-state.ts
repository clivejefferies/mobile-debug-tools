import { systemClock, type Clock } from '../../runtime/clock.js'
import type { ActionTargetResolved } from '../../types.js'
import type { UiSelector } from '../../contracts/selector.js'
import type { UiTree, ObserveUI } from '../observation.js'
import type { UiElement } from '../model.js'
import type { UICondition } from './ui-wait-condition.js'
import { currentReadinessWait } from '../../observe/readiness.js'

export interface UIWaitInput {
  selector?: UiSelector; condition?: UICondition; timeout_ms?: number; poll_interval_ms?: number
  match?: { index?: number }; retry?: { max_attempts?: number; backoff_ms?: number }
  platform?: 'android' | 'ios'; deviceId?: string; singleObservation?: boolean; singleAttempt?: boolean
  rejectAmbiguous?: boolean; resolveTapTarget?: boolean
}
export interface UIWaitDependencies {
  clock?: Clock
  observe: ObserveUI
  resolve(platform: 'android' | 'ios', deviceId: string | undefined, element: UiElement, index: number): ActionTargetResolved
}
export interface UIWaitResult {
  status: string; error?: { code: string; message?: string }; matched?: number; element?: ActionTargetResolved | null; _tree?: UiTree
  metrics?: { latency_ms: number; poll_count: number; attempts: number }
  requested?: { selector: UiSelector; condition: UICondition; match: { index: number } | null }
  observed?: { matched_count: number; condition_satisfied: boolean; selected_index: number | null; last_matched_element: ActionTargetResolved | null }
}
export function createUIWait(input: UIWaitInput, clock: Clock = systemClock) {
  const tracker = currentReadinessWait(), start = clock.now()
  const requestedIndex = typeof input.match?.index === 'number' ? input.match.index : null
  const args = { condition: 'exists' as UICondition, timeout_ms: 60000, poll_interval_ms: 300,
    retry: { max_attempts: 1, backoff_ms: 0 }, singleObservation: false, singleAttempt: false,
    rejectAmbiguous: false, resolveTapTarget: false, ...input }
  // Explicit undefined values have the same defaults as destructured handler parameters.
  if (args.condition === undefined) args.condition = 'exists'
  if (args.timeout_ms === undefined) args.timeout_ms = 60000
  if (args.poll_interval_ms === undefined) args.poll_interval_ms = 300
  if (args.retry === undefined) args.retry = { max_attempts: 1, backoff_ms: 0 }
  const requested = { selector: args.selector ?? {}, condition: args.condition, match: requestedIndex === null ? null : { index: requestedIndex } }
  return { clock, args, requestedIndex, requested, tracker, start, attempts: 0, polls: 0,
    count: 0, element: null as ActionTargetResolved | null, met: false, stable: 0 }
}
export type UIWaitState = ReturnType<typeof createUIWait>
export function waitObserved(s: UIWaitState, condition = s.met) {
  return { matched_count: s.count, condition_satisfied: condition, selected_index: s.element?.index ?? null, last_matched_element: s.element }
}
export function waitFailure(s: UIWaitState, code: string, message: string, observed = waitObserved(s, false)): UIWaitResult {
  return { status: 'timeout', error: { code, message }, metrics: { latency_ms: s.clock.now() - s.start, poll_count: s.polls, attempts: s.attempts }, requested: s.requested, observed }
}
export function validateUIWait(s: UIWaitState) {
  const { selector, condition, platform } = s.args
  const valid = [selector?.text, selector?.resource_id, selector?.accessibility_id].some(value => typeof value === 'string' && value.trim().length > 0)
  if (!valid) return waitFailure(s, 'INVALID_SELECTOR', 'Selector must include at least one non-empty field: text, resource_id, or accessibility_id')
  if (!['exists', 'not_exists', 'visible', 'clickable'].includes(condition)) return waitFailure(s, 'INVALID_CONDITION', `Unsupported condition: ${condition}`)
  if (platform && !['android', 'ios'].includes(platform)) return waitFailure(s, 'PLATFORM_NOT_SUPPORTED', `Unsupported platform: ${platform}`)
  return null
}
