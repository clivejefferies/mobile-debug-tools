import { z } from 'zod'
const target = { platform: z.enum(['android', 'ios']), deviceId: z.string().min(1).optional(), appId: z.string().regex(/^[a-zA-Z0-9._-]+$/).optional(), template: z.enum(['System Trace', 'Time Profiler', 'Animation Hitches', 'Hangs']).optional() }
const validTarget = (value: { platform: string; deviceId?: string; appId?: string; template?: string }) =>
  value.platform === 'ios' ? !!value.deviceId : value.appId === undefined && value.template === undefined
export const traceTargetSchema = z.object(target).strict().refine(validTarget)
export const traceStartSchema = z.object({ ...target, durationMs: z.number().int().min(1000).max(120000).default(30000) }).strict().refine(validTarget).refine(value => value.platform !== 'ios' || !!value.appId)
export const traceControlSchema = z.object({ traceId: z.string().uuid() }).strict()
const properties = { platform: { type: 'string', enum: ['android', 'ios'] }, deviceId: { type: 'string', minLength: 1 }, appId: { type: 'string', minLength: 1, pattern: '^[a-zA-Z0-9._-]+$', description: 'iOS only: running development app bundle identifier; required for iOS start.' }, template: { type: 'string', enum: ['System Trace', 'Time Profiler', 'Animation Hitches', 'Hangs'], description: 'iOS only. Default Time Profiler; initial simulator support is Time Profiler only.' } }
const platformRules = (start: boolean) => ({ oneOf: [
  { properties: { platform: { const: 'android' } }, not: { anyOf: [{ required: ['appId'] }, { required: ['template'] }] } },
  { properties: { platform: { const: 'ios' } }, required: start ? ['deviceId', 'appId'] : ['deviceId'] }
] })
export const systemTraceTools = [
  { name: 'get_system_trace_capabilities', description: 'Probe Android Perfetto or iOS Instruments prerequisites without recording. iOS requires explicit booted simulator deviceId; reports template matrix and unknown profiling permissions.',
    inputSchema: { type: 'object' as const, additionalProperties: false, required: ['platform'], properties, ...platformRules(false) } },
  { name: 'start_system_trace', description: 'Start bounded Android Perfetto or iOS simulator Time Profiler recording, returning an owned trace_id after readiness. iOS requires explicit deviceId and running appId. Run an existing journey with systemTraceId, then stop to retrieve a local artifact or cancel to discard. Traces can contain sensitive system metadata, logs and paths; local user-managed retention, no upload.',
    inputSchema: { type: 'object' as const, additionalProperties: false, required: ['platform'], properties: { ...properties, durationMs: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 } }, ...platformRules(true) } },
  ...['get_system_trace_status', 'stop_system_trace', 'cancel_system_trace'].map(name => ({ name,
    description: name === 'get_system_trace_status' ? 'Reconcile an owned trace and retrieve its state; finalise duration-completed capture.' :
      name === 'stop_system_trace' ? 'Stop owned capture gracefully and retrieve a local Perfetto file or validated Instruments .trace bundle. Retry after a transfer/cleanup failure.' : 'Stop owned capture and discard partial files. Already completed local artifacts are retained.',
    inputSchema: { type: 'object' as const, additionalProperties: false, required: ['traceId'], properties: { traceId: { type: 'string', format: 'uuid' } } }
  }))
]
