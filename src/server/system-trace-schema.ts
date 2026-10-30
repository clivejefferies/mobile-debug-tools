import { z } from 'zod'
const target = { platform: z.enum(['android', 'ios']), deviceId: z.string().min(1).optional() }
export const traceTargetSchema = z.object(target).strict()
export const traceStartSchema = z.object({ ...target, durationMs: z.number().int().min(1000).max(120000).default(30000) }).strict()
export const traceControlSchema = z.object({ traceId: z.string().uuid() }).strict()
const properties = { platform: { type: 'string', enum: ['android', 'ios'] }, deviceId: { type: 'string', minLength: 1 } }
export const systemTraceTools = [
  { name: 'get_system_trace_capabilities', description: 'Probe Android Perfetto prerequisites without recording. Device-wide system tracing is optional; iOS is unsupported.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['platform'], properties } },
  { name: 'start_system_trace', description: 'Start bounded Android Perfetto recording, returning an owned trace_id. Run an existing journey with systemTraceId, then stop to retrieve a local artifact or cancel to discard. Device-wide traces may contain sensitive system annotations; no upload.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['platform'], properties: { ...properties, durationMs: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 } } } },
  ...['get_system_trace_status', 'stop_system_trace', 'cancel_system_trace'].map(name => ({ name,
    description: name === 'get_system_trace_status' ? 'Reconcile an owned trace and retrieve its state; finalise duration-completed capture.' :
      name === 'stop_system_trace' ? 'Stop owned capture gracefully and retrieve a local Perfetto artifact. Retry after a transfer/cleanup failure.' : 'Stop owned capture and discard partial files. Already completed local artifacts are retained.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['traceId'], properties: { traceId: { type: 'string', format: 'uuid' } } }
  }))
]
