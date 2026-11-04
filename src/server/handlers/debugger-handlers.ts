import { iosCapabilities } from '../../debugger/ios-worker.js'
import { debuggerResponse } from './debugger-response.js'
import { classify, type DebuggerDiagnostic } from '../../debugger/diagnostics.js'
import { debuggerContracts } from '../schemas/debugger-schema.js'
import { debuggerSessions, iosDebuggerSessions, debuggerCapabilities } from '../../debugger/sessions.js'
import { DebuggerError, withDebuggerBudget } from '../../debugger/worker.js'
import { wrapResponse, type ToolCallArgs } from '../common.js'
function failure(code: string, summary: Record<string, unknown> = {}, diagnostic?: DebuggerDiagnostic, command = '', mode: 'compact' | 'debug' = 'debug') {
  return {
    ...wrapResponse(debuggerResponse(command, mode, {
      debug_session_id: null, device: null, target: null, state: null,
      captured_at_ms: Date.now(), capabilities: debuggerCapabilities, limitations: [], cleanup: null,
      ...summary, success: false, error: { code, message: code, retryable: false, ...(diagnostic ? { diagnostic } : {}) }
    })), isError: true
  }
}
export async function handleDebugger(name: string, args: ToolCallArgs, signal?: AbortSignal) {
  const parsed = debuggerContracts[name].schema.safeParse(args)
  if (!parsed.success) return failure('INVALID_ARGUMENT')
  const { responseMode, ...input } = parsed.data
  const a = input as { platform?: 'android' | 'ios'; timeoutMs: number; deviceId?: string; appId?: string; processId?: number; debugSessionId?: string }
  const command = debuggerContracts[name].command
  const sessions = selectSessions(a)
  try {
    if (signal?.aborted) throw new DebuggerError('DEBUGGER_CANCELLED')
    const result = await withDebuggerBudget(a.timeoutMs, signal, async () => command === 'capabilities' ? await sessions.capabilities(a.deviceId!, a.appId!, a.processId) :
      command === 'attach' ? await sessions.attach(a.deviceId!, a.appId!, a.processId, a.timeoutMs) :
        await sessions.command(a.debugSessionId!, command, { ...a, signal: command === 'events' ? signal : undefined }, a.timeoutMs))
    if (signal?.aborted && command === 'capabilities') throw new DebuggerError('DEBUGGER_CANCELLED')
    const payload = sessions === iosDebuggerSessions ? iosDiagnostics(result) : result
    return { ...wrapResponse(debuggerResponse(command, responseMode, payload)), ...(!result.success ? { isError: true } : {}) }
  } catch (e) {
    const error = classify(e, 'unknown', 'DEBUGGER_WORKER_FAILED')
    const code = error.code
    let summary: Partial<ReturnType<typeof debuggerSessions.summary>> = {}
    if (a.debugSessionId) { try { summary = sessions.summary(a.debugSessionId) } catch { /* Unknown session */ } }
    const response = failure(code, {
      ...(sessions === iosDebuggerSessions ? { capabilities: iosCapabilities } : {}),
      debug_session_id: a.debugSessionId ?? null,
      device: a.deviceId ? { platform: a.platform ?? 'android', id: a.deviceId } : null, ...summary
    }, code === 'DEBUGGER_CLEANUP_FAILED' ? summary.error?.diagnostic : error.diagnostic, command, responseMode)
    if (sessions === iosDebuggerSessions) response.content[0].text = JSON.stringify(iosDiagnostics(JSON.parse(response.content[0].text)))
    return response
  }
}

function selectSessions(a: { platform?: string; debugSessionId?: string }) {
  return a.platform === 'ios' || (a.debugSessionId && iosDebuggerSessions.owns(a.debugSessionId)) ? iosDebuggerSessions : debuggerSessions
}
function iosRecovery(d: DebuggerDiagnostic) {
  return { ...d, recovery: d.recovery.replace('JDK 17+ availability, including java, javac and jdk.jdi.', 'Xcode and its Swift-enabled LLDB/Python availability.').replace('JDK compiler and worker source/cache', 'LLDB worker source').replace('Java worker', 'LLDB worker').replace('ADB server', 'simulator') }
}
function iosDiagnostics<T extends Record<string, unknown>>(value: T) {
  const result = { ...value }
  const error = value.error as { diagnostic?: DebuggerDiagnostic } | undefined
  return { ...result, ...(error?.diagnostic ? { error: { ...error, diagnostic: iosRecovery(error.diagnostic) } } : {}),
    ...(Array.isArray(value.diagnostics) ? { diagnostics: (value.diagnostics as DebuggerDiagnostic[]).map(iosRecovery) } : {}) }
}
