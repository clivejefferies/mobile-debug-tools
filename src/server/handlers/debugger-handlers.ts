import { debuggerContracts } from '../schemas/debugger-schema.js'
import { debuggerSessions, debuggerCapabilities } from '../../debugger/sessions.js'
import { DebuggerError, withDebuggerBudget } from '../../debugger/worker.js'
import { wrapResponse, type ToolCallArgs } from '../common.js'
function failure(code: string, summary: Record<string, unknown> = {}) {
  return { ...wrapResponse({ debug_session_id: null, device: null, target: null, state: null,
    captured_at_ms: Date.now(), capabilities: debuggerCapabilities, limitations: [], cleanup: null,
    ...summary, success: false, error: { code, message: code, retryable: false } }), isError: true }
}
export async function handleDebugger(name: string, args: ToolCallArgs, signal?: AbortSignal) {
  const parsed = debuggerContracts[name].schema.safeParse(args)
  if (!parsed.success) return failure('INVALID_ARGUMENT')
  const a = parsed.data as Record<string, any>
  const command = debuggerContracts[name].command
  try {
    if (signal?.aborted) throw new DebuggerError('DEBUGGER_CANCELLED')
    const result = await withDebuggerBudget(a.timeoutMs, signal, async () => command === 'capabilities' ? await debuggerSessions.capabilities(a.deviceId, a.appId, a.processId) :
      command === 'attach' ? await debuggerSessions.attach(a.deviceId, a.appId, a.processId, a.timeoutMs) :
      await debuggerSessions.command(a.debugSessionId, command, { ...a, signal: command === 'events' ? signal : undefined }, a.timeoutMs))
    if (signal?.aborted && command === 'capabilities') throw new DebuggerError('DEBUGGER_CANCELLED')
    return { ...wrapResponse(result), ...(!result.success ? { isError: true } : {}) }
  } catch (e) {
    const code = e instanceof DebuggerError ? e.code : 'DEBUGGER_WORKER_FAILED'
    let summary: any = {}
    if (a.debugSessionId) { try { summary = debuggerSessions.summary(a.debugSessionId) } catch { /* Unknown session */ } }
    return failure(code, { debug_session_id: a.debugSessionId ?? null,
      device: a.deviceId ? { platform: 'android', id: a.deviceId } : null, ...summary })
  }
}
