import { checkDebuggerGuard } from '../debugger/guard.js'
import { createLegacyWait, legacySleep, type LegacyWaitInput, type LegacyWaitDependencies, type LegacyWait } from './legacy-wait-state.js'
import { legacyBaseline, legacyUI, legacyScreen, legacyIdle } from './legacy-wait-observations.js'
import { legacyLog } from './legacy-log-wait.js'
async function sample(s: LegacyWait, deps: LegacyWaitDependencies) {
  s.polls++
  const now = Date.now()
  if (s.type === 'ui') return legacyUI(s, deps)
  if (s.type === 'log') return legacyLog(s, deps)
  if (s.type === 'screen') return legacyScreen(s, deps, now)
  if (s.type === 'idle') return legacyIdle(s, deps)
  return null
}
export async function waitForUICore(input: LegacyWaitInput, deps: LegacyWaitDependencies) {
  const state = createLegacyWait(input)
  await legacyBaseline(state, deps)
  state.lastChange = Date.now(); state.previous = state.initial
  if (typeof state.observationDelayMs === 'number' && state.observationDelayMs > 0) {
    try { console.log(`waitForUI: delaying observation for ${state.observationDelayMs}ms`) } catch { /* Best effort. */ }
    await legacySleep(state.observationDelayMs)
  }
  while (Date.now() <= state.deadline) {
    const result = await sample(state, deps)
    if (result) return result
    await legacySleep(state.interval)
  }
  let snapshot: unknown = null
  if (state.includeSnapshotOnFailure) {
    try { snapshot = await deps.snapshot({ reason: `wait_for_ui timeout for ${state.type}`, includeLogs: true, ...state.target }) }
    catch (error) { checkDebuggerGuard(); snapshot = { error: error instanceof Error ? error.message : String(error) } }
  }
  return { success: false, condition: state.match, query: state.query, poll_count: state.polls,
    duration_ms: Date.now() - state.start, stable_duration_ms: state.duration, error: 'Timeout waiting for condition', snapshot, observed_state: state.observed ?? null }
}
