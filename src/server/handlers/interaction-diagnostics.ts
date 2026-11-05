import { randomUUID } from 'node:crypto'
import { evidenceSessionId } from '../../observe/evidence.js'
import { diagnosticsSchema } from '../schemas/interaction-diagnostics.js'
import { wrapResponse, type ToolCallArgs } from '../common.js'

type ExpiryScheduler = (expire: () => void) => () => void
const scheduleExpiry: ExpiryScheduler = expire => {
  const timer = setTimeout(expire, 600000)
  timer.unref()
  return () => clearTimeout(timer)
}

export class InteractionDiagnostics {
  private readonly entries = new Map<string, { text: string; completed: number; bytes: number; cancel: () => void }>()
  private bytes = 0
  constructor(private readonly now = () => performance.now(), readonly sessionId = evidenceSessionId(), private readonly schedule: ExpiryScheduler = scheduleExpiry) {}

  private remove(id: string) {
    const entry = this.entries.get(id)
    if (entry) { this.bytes -= entry.bytes; entry.cancel() }
    this.entries.delete(id)
  }
  private prune() {
    for (const [id, entry] of this.entries) if (this.now() - entry.completed >= 600000) this.remove(id)
  }
  retain(result: unknown) {
    this.prune()
    const resultId = randomUUID(), text = JSON.stringify(result), bytes = Buffer.byteLength(text)
    const ref = { session_id: this.sessionId, result_id: resultId }
    if (bytes > 1024 * 1024) return { ...ref, available: false, reason: 'RESULT_TOO_LARGE' }
    while (this.entries.size >= 100 || this.bytes + bytes > 16 * 1024 * 1024) this.remove(this.entries.keys().next().value!)
    this.entries.set(resultId, { text, completed: this.now(), bytes, cancel: this.schedule(() => this.remove(resultId)) })
    this.bytes += bytes
    return { ...ref, available: true }
  }
  lookup(sessionId: string, resultId: string) {
    this.prune()
    if (sessionId !== this.sessionId) return { success: false, error: { code: 'SESSION_MISMATCH', message: 'Use the session_id returned with this result.' } }
    const entry = this.entries.get(resultId)
    if (!entry) return { success: false, error: { code: 'RESULT_UNAVAILABLE', message: 'Result expired, was evicted, is unknown, or belongs to a previous server process. Do not replay input automatically.' } }
    return { success: true, result: JSON.parse(entry.text) as unknown }
  }
}
export const interactionDiagnostics = new InteractionDiagnostics()
export async function handleInteractionDiagnostics(args: ToolCallArgs) {
  const parsed = diagnosticsSchema.safeParse(args)
  return wrapResponse(parsed.success ? interactionDiagnostics.lookup(parsed.data.sessionId, parsed.data.resultId) : {
    success: false, error: { code: 'INVALID_ARGUMENT', message: 'Expected only sessionId and resultId UUID strings.' }
  }, false)
}
