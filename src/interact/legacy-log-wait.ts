import { checkDebuggerGuard } from '../debugger/guard.js'
import { logMessages, legacySuccess, type LegacyWait, type LegacyWaitDependencies } from './legacy-wait-state.js'
function streamMessage(entry: unknown) {
  if (!entry) return ''
  if (typeof entry === 'object') { const fields = entry as { message?: unknown; msg?: unknown }; return fields.message || fields.msg || entry }
  return entry
}
export async function legacyLog(s: LegacyWait, deps: LegacyWaitDependencies) {
  try {
    const stream = await deps.stream({ platform: s.target.platform, sessionId: 'default', limit: 200 })
    for (const entry of stream && Array.isArray(stream.entries) ? stream.entries : []) {
      const message = streamMessage(entry)
      if (s.query && String(message).includes(s.query)) {
        const result = legacySuccess(s, 'log', 'log-stream', 0, { matchedLog: { message, raw: entry } })
        return { ...result, observed_state: true }
      }
    }
    const logs = await deps.logs({ ...s.target, lines: 200 })
    const messages = logMessages(Array.isArray(logs && logs.logs) ? logs!.logs! : [])
    const index = s.baseline ? messages.lastIndexOf(s.baseline) : -1
    for (let i = index >= 0 ? index + 1 : 0; i < messages.length; i++) {
      const message = messages[i]
      if (s.query && String(message).includes(s.query)) {
        const result = legacySuccess(s, 'log', 'log-snapshot', 0, { matchedLog: { message } })
        return { ...result, observed_state: true }
      }
    }
  } catch (error) { checkDebuggerGuard(); console.error('waitForUI(log) error:', error) }
  return null
}
