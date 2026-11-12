import { TraceCleanupError, type HttpTraceSessions } from '../../observe/http-trace/sessions.js'
import { wrapResponse } from '../common.js'
import { httpTraceRead, httpTraceStart, httpTraceStop, httpTraceTools } from '../schemas/http-trace-schema.js'

export const httpTraceNames = new Set(httpTraceTools.map(tool => tool.name))

export async function handleHttpTrace(sessions: HttpTraceSessions, name: string, args: unknown, signal?: AbortSignal) {
  try {
    if (name === 'start_http_trace') {
      const parsed = httpTraceStart.safeParse(args)
      if (!parsed.success) throw new Error('INVALID_ARGUMENT')
      const allowedHosts = [...new Set(parsed.data.allowedHosts.map(host => host.toLowerCase()))]
      return wrapResponse(await sessions.start({ ...parsed.data, allowedHosts }, signal))
    }
    if (name === 'read_http_trace') {
      const parsed = httpTraceRead.safeParse(args)
      if (!parsed.success) throw new Error('INVALID_ARGUMENT')
      return wrapResponse(sessions.read(parsed.data.traceId, parsed.data.cursor, parsed.data.pageSize))
    }
    const parsed = httpTraceStop.safeParse(args)
    if (!parsed.success) throw new Error('INVALID_ARGUMENT')
    const result = await sessions.stop(parsed.data.traceId)
    return { ...wrapResponse(result), ...(result.cleanedUp ? {} : { isError: true }) }
  } catch (error) {
    const code = error instanceof Error && /^(?:HTTP_TRACE_[A-Z_]+|INVALID_ARGUMENT)$/.test(error.message)
      ? error.message : 'HTTP_TRACE_UNAVAILABLE'
    return { ...wrapResponse({ error: { tool: name, code,
      ...(error instanceof TraceCleanupError ? { traceId: error.traceId } : {}),
    } }), isError: true }
  }
}
