import { checkDebuggerGuard } from '../debugger/guard.js'
import { logMessages, legacySuccess, type LegacyWait, type LegacyWaitDependencies } from './legacy-wait-state.js'
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))])
}
export async function legacyBaseline(s: LegacyWait, deps: LegacyWaitDependencies) {
  try {
    const fingerprint = deps.fingerprint(s.target), logs = deps.logs({ ...s.target, lines: 200 })
    const [fp, result] = await Promise.all([withTimeout(fingerprint, 300), withTimeout(logs, 500)])
    if (fp && typeof fp === 'object') s.initial = fp.fingerprint ?? null
    if (result) { const messages = logMessages(Array.isArray(result.logs) ? result.logs : []); s.baseline = messages.length ? messages[messages.length - 1] : null }
  } catch (error) {
    checkDebuggerGuard()
    try { console.warn('waitForUI: failed to get baseline data (non-fatal):', error instanceof Error ? error.message : String(error)) } catch { /* Logging is best-effort. */ }
  }
}
export async function legacyUI(s: LegacyWait, deps: LegacyWaitDependencies) {
  try {
    try {
      const found = await deps.find({ query: s.query, exact: false, timeoutMs: Math.min(500, s.interval), ...s.target })
      const present = !!(found && found.found), matched = s.match === 'present' ? present : !present
      if (matched) {
        if (s.matched === null) s.matched = Date.now()
        s.duration = Date.now() - s.matched; s.observed = true
        if (s.duration >= s.stability_ms) return legacySuccess(s, 'ui', 'ui-find', s.duration, { matchedElement: present ? found.element : null }, s.match)
      } else { s.matched = null; s.duration = 0; s.observed = false }
    } catch (error) { checkDebuggerGuard(); console.error('waitForUI(ui) find error:', error) }
  } catch (error) { checkDebuggerGuard(); console.error('waitForUI(ui) outer error:', error) }
  return null
}
export async function legacyScreen(s: LegacyWait, deps: LegacyWaitDependencies, now: number) {
  try {
    const fp = (await deps.fingerprint(s.target))?.fingerprint ?? null
    if (fp !== null && fp !== undefined && fp !== s.initial) {
      if (s.matched === null) s.matched = now
      const confirm = (await deps.fingerprint(s.target))?.fingerprint ?? null
      if (confirm === fp) {
        s.duration = Date.now() - s.matched; s.observed = true
        if (s.duration >= s.stability_ms) return legacySuccess(s, 'screen', 'screen-fingerprint', s.duration, { newFingerprint: fp })
      } else { s.matched = null; s.duration = 0; s.observed = false }
    }
  } catch (error) { checkDebuggerGuard(); console.error('waitForUI(screen) error:', error) }
  return null
}
export async function legacyIdle(s: LegacyWait, deps: LegacyWaitDependencies) {
  try {
    const fp = (await deps.fingerprint(s.target))?.fingerprint ?? null
    if (fp !== s.previous) { s.previous = fp; s.lastChange = Date.now(); s.matched = null; s.duration = 0; s.observed = false }
    else {
      const idle = Date.now() - s.lastChange; s.observed = true
      if (idle >= s.stability_ms) return legacySuccess(s, 'idle', 'idle-stable', idle)
    }
  } catch (error) { checkDebuggerGuard(); console.error('waitForUI(idle) error:', error) }
  return null
}
