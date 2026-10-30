import type { WaitForUIChangeResponse } from '../types.js'
import type { ObserveUI, UiTree } from './observation.js'
import type { ScopeTree } from './target-scope.js'
import type { UiChangeScopeResult, UiChangeSignatureSet } from './model.js'
import { remainingBudget } from '../utils/operation-budget.js'
import { checkDebuggerGuard } from '../debugger/guard.js'
import { observeReadinessWait, isDeviceUnavailable } from '../observe/readiness.js'
import { readinessDelay } from '../observe/readiness-service.js'
import { _buildUiChangeSignatures, _summarizeUiChangeDelta, _matchesUiChange, _uiChangeSignaturesEqual } from './ui-change-helpers.js'
import { createChangeWait, changeResult, type ChangeInput, type ChangeWait } from './ui-change-state.js'
export interface ChangeDependencies { observe: ObserveUI; scope(tree: ScopeTree, scope: 'screen' | 'subtree', target: string | null): UiChangeScopeResult }
function scopeFailure(s: ChangeWait, tree: UiTree, scoped: UiChangeScopeResult): WaitForUIChangeResponse {
  s.scope = scoped.resolution
  return { success: false, observed_change: null, snapshot_revision: typeof tree?.snapshot_revision === 'number' ? tree.snapshot_revision : s.revision ?? undefined,
    snapshot_freshness_ms: typeof tree?.captured_at_ms === 'number' ? Math.max(0, Date.now() - tree.captured_at_ms) : s.age ?? null,
    timeout: true, elapsed_ms: Date.now() - s.start, expected_change: s.input.expected_change, loading_state: tree?.loading_state ?? s.loading ?? null,
    scope: scoped.resolution.scope, target: scoped.resolution.target, stability_state: 'transient', change_summary: s.summary, reason: scoped.error!.message, error: scoped.error }
}
function changed(s: ChangeWait, signatures: UiChangeSignatureSet) {
  const change = _matchesUiChange(s.input.expected_change, s.baseline!, signatures)
  if (!change) { s.candidate = null; s.change = null; s.since = null; return false }
  if (!s.candidate || !_uiChangeSignaturesEqual(s.candidate, signatures) || s.change !== change) {
    s.candidate = signatures; s.change = change; s.since = Date.now()
  }
  const stable = s.since === null ? 0 : Date.now() - s.since
  return (s.stability === 0 || stable >= s.stability) && (!s.tracker || s.tracker.summary.state === 'settled')
}
async function sample(s: ChangeWait, deps: ChangeDependencies) {
  if (s.tracker) remainingBudget()
  const started = Date.now(), a = s.input
  const tree = await deps.observe({ platform: a.platform, deviceId: a.deviceId })
  observeReadinessWait(tree, started)
  const scoped = deps.scope(tree, a.scope, a.target)
  if (scoped.error) return scopeFailure(s, tree, scoped)
  const signatures = _buildUiChangeSignatures({ ...tree, elements: scoped.elements })
  s.revision = typeof tree?.snapshot_revision === 'number' ? tree.snapshot_revision : s.revision
  s.loading = tree?.loading_state ?? s.loading
  s.age = typeof tree?.captured_at_ms === 'number' ? Math.max(0, Date.now() - tree.captured_at_ms) : s.age
  s.summary = s.baseline ? _summarizeUiChangeDelta(s.baselineScope?.elements ?? [], scoped.elements) : s.summary
  s.scope = scoped.resolution; s.baselineScope = s.baselineScope ?? scoped
  if (!s.baseline) { s.baseline = signatures; s.baselineScope = scoped }
  else if (changed(s, signatures)) return changeResult(s, true, 'UI change observed')
  return null
}
export async function waitForUIChange(input: ChangeInput, deps: ChangeDependencies): Promise<WaitForUIChangeResponse> {
  const state = createChangeWait(input)
  while (Date.now() - state.start < state.input.timeout_ms) {
    try { const result = await sample(state, deps); if (result) return result }
    catch (error) {
      checkDebuggerGuard()
      if (state.tracker && !String(error).includes('READINESS_')) state.tracker.unavailable()
      if (state.tracker && isDeviceUnavailable(error)) throw error
      if (state.tracker && String(error).includes('ACTION_TIMEOUT')) { state.tracker.deadline(); break }
    }
    await (state.tracker ? readinessDelay(300) : new Promise(resolve => setTimeout(resolve, 300)))
  }
  return changeResult(state, false, 'timeout')
}
