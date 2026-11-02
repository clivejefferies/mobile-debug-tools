/** Only catalog values cross the debugger error boundary. Never inspect exception text. */
export const stages = ['prerequisite', 'compilation', 'worker_start', 'ipc', 'target_resolution', 'forwarding', 'attach', 'command', 'transport', 'cleanup', 'unknown'] as const
export const reasons = ['unavailable', 'unsupported', 'spawn_failed', 'process_exited', 'invalid_message', 'message_limit', 'write_failed', 'connection_refused', 'transport_lost', 'timeout', 'cancelled', 'operation_failed', 'unknown'] as const
export type DiagnosticStage = typeof stages[number]
export type DiagnosticReason = typeof reasons[number]
export interface DebuggerDiagnostic { stage: DiagnosticStage; reason: DiagnosticReason; recovery: string }
const recovery: Record<DiagnosticStage, string> = {
  prerequisite: 'Check JDK 17+ availability, including java, javac and jdk.jdi.',
  compilation: 'Check the JDK compiler and worker source/cache availability.',
  worker_start: 'Check Java worker launch availability. Inspect session state and cleanup before attaching again.',
  ipc: 'Inspect session state and cleanup. Detach before attempting a fresh attach.',
  target_resolution: 'Check the explicit device and running debuggable app/process.',
  forwarding: 'Check the explicit device and debugger forwarding availability.',
  attach: 'Check the running debuggable target and whether another debugger is attached. Inspect cleanup before a fresh attach.',
  command: 'Inspect debugger session state and cleanup before another state-changing command.',
  transport: 'Inspect session state and cleanup. Detach before attempting a fresh attach; execution state may be unknown.',
  cleanup: 'Retry detach_debugger and inspect cleanup.remaining_resources. Do not kill the app or ADB server.',
  unknown: 'Inspect debugger session state and cleanup; the failure cause is unknown.'
}
export function diagnostic(stage: DiagnosticStage, reason: DiagnosticReason): DebuggerDiagnostic {
  const guidance = reason === 'timeout' || reason === 'cancelled'
    ? 'Execution may be uncertain. Inspect session state and cleanup before another state-changing command.' : recovery[stage]
  return { stage, reason, recovery: guidance }
}
export function parseDiagnostic(value: unknown): DebuggerDiagnostic {
  if (!value || typeof value !== 'object') throw new Error('INVALID_WORKER_DIAGNOSTIC')
  const { stage, reason } = value as Record<string, unknown>
  if (!stages.includes(stage as DiagnosticStage) || !reasons.includes(reason as DiagnosticReason)) throw new Error('INVALID_WORKER_DIAGNOSTIC')
  return diagnostic(stage as DiagnosticStage, reason as DiagnosticReason)
}
export class DebuggerError extends Error {
  constructor(public code: string, public diagnostic?: DebuggerDiagnostic) { super(code) }
}
const validationCodes = new Set(['INVALID_ARGUMENT', 'DEBUGGER_BUSY', 'DEBUGGER_NOT_FOUND', 'DEBUGGER_PAUSED', 'DEBUGGER_NOT_PAUSED', 'DEBUGGER_STALE_REFERENCE'])
export function classify(error: unknown, stage: DiagnosticStage, fallback: string, reason: DiagnosticReason = 'unknown'): DebuggerError {
  const existing = error instanceof DebuggerError ? error : new DebuggerError(fallback)
  if (existing.diagnostic || validationCodes.has(existing.code)) return existing
  const knownReason = existing.code === 'DEBUGGER_TIMEOUT' ? 'timeout' : existing.code === 'DEBUGGER_CANCELLED' ? 'cancelled' : reason
  return new DebuggerError(existing.code, diagnostic(stage, knownReason))
}
export async function atStage<T>(stage: DiagnosticStage, fallback: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) { throw classify(error, stage, fallback) }
}
