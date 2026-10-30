import { z } from 'zod'
const text = z.string().min(1).max(512)
const integer = z.number().int().safe().positive()
const timeout = z.number().int().min(100).max(30000)
const target = { platform: z.literal('android'), deviceId: text, appId: text.regex(/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/), processId: integer.optional() }
const session = { debugSessionId: text }
const stop = { ...session, stopId: text }
const specs = {
  get_debugger_capabilities: { fields: target, command: 'capabilities', description: 'Probe optional Android JDK/JDWP prerequisites and matching running debuggable processes; does not attach.' },
  attach_debugger: { fields: target, command: 'attach', description: 'Attach an owned Android JDI session. Requires an explicit device and debuggable app; choose processId when ambiguous. Stops suspend all app threads. Auto-detach: 60s paused, 5m idle, 30m total.' },
  get_debugger_state: { fields: session, command: 'state', description: 'Read debugger state, current stop and breakpoint/cleanup status.' },
  set_debugger_breakpoint: { fields: { ...session, className: text.regex(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/), line: integer }, command: 'set', description: 'Set an exact binary-class and executable-source-line breakpoint; unloaded classes remain pending. No silent line relocation.' },
  remove_debugger_breakpoint: { fields: { ...session, breakpointId: text }, command: 'remove', description: 'Remove an owned breakpoint; repeated removal succeeds.' },
  wait_for_debugger_event: { fields: { ...session, afterSequence: z.number().int().safe().min(0).optional() }, command: 'events', description: 'Wait for bounded debugger events after a sequence cursor. Empty timeout does not affect execution; overflow is explicit.' },
  get_debugger_stack: { fields: { ...stop, threadId: text, offset: z.number().int().min(0).max(999).optional(), limit: z.number().int().min(1).max(100).optional() }, command: 'stack', description: 'Read bounded stack frames for a stopped thread; IDs expire on resume.' },
  get_debugger_locals: { fields: { ...stop, frameId: text }, command: 'locals', description: 'Read at most 100 shallow locals. Sensitive values returned only on request; strings truncate at 256 characters. No evaluation or field traversal.' },
  step_debugger: { fields: { ...stop, threadId: text, kind: z.enum(['into', 'over', 'out']) }, command: 'step', description: 'Acknowledge one-shot line stepping and resume. Wait for a subsequent stop event separately.' },
  resume_debugger: { fields: stop, command: 'resume', description: 'Resume owned debugger suspension and immediately expire stopped references.' },
  detach_debugger: { fields: session, command: 'detach', description: 'Dispose the owned debugger connection, release owned suspension and remove its exact forward. Idempotent; retries incomplete cleanup.' }
}
// Derive JSON schemas and runtime validation from the same small Zod field vocabulary.
function jsonField(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) return jsonField(schema.unwrap() as z.ZodType)
  if (schema instanceof z.ZodLiteral) return { type: 'string', enum: [schema.value] }
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options }
  if (schema instanceof z.ZodString) {
    const json = z.toJSONSchema(schema)
    return { type: 'string', minLength: 1, maxLength: 512, ...(json.pattern ? { pattern: json.pattern } : {}) }
  }
  if (schema instanceof z.ZodNumber) return { type: 'integer', minimum: schema.minValue, maximum: schema.maxValue }
  throw new Error('Unsupported debugger field schema')
}
export const debuggerContracts = Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, {
  ...spec, schema: z.object({ ...spec.fields, timeoutMs: timeout.default(name === 'wait_for_debugger_event' ? 1000 : 10000) }).strict()
}]))
export const debuggerTools = Object.entries(debuggerContracts).map(([name, spec]) => ({
  name, description: spec.description,
  inputSchema: {
    type: 'object' as const, additionalProperties: false,
    required: Object.entries(spec.fields).filter(([, field]) => !field.isOptional()).map(([key]) => key),
    properties: { ...Object.fromEntries(Object.entries(spec.fields).map(([key, field]) => [key, jsonField(field)])), timeoutMs: { type: 'integer', minimum: 100, maximum: 30000, default: name === 'wait_for_debugger_event' ? 1000 : 10000 } }
  }
}))
