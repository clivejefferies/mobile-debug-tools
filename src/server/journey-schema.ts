import { z } from 'zod'

const selector = z.object({
  text: z.string().min(1).optional(), resource_id: z.string().min(1).optional(),
  accessibility_id: z.string().min(1).optional(), contains: z.boolean().optional()
}).strict().refine(value => !!(value.text || value.resource_id || value.accessibility_id), 'Selector requires a target')
const verificationMode = z.enum(['none', 'light', 'full'])
const timeoutMs = z.number().int().min(100).max(60000).optional()
const pollIntervalMs = z.number().int().min(50).max(1000).optional()
const waitFor = z.object({
  condition: z.enum(['exists', 'visible', 'clickable']).optional(),
  timeoutMs: z.number().int().min(100).max(10000).optional(), pollIntervalMs,
  match: z.object({ index: z.number().int().nonnegative().optional() }).strict().optional()
}).strict()
const target = { selector: selector.optional(), elementId: z.string().min(1).optional() }
const exactlyOneTarget = (value: { selector?: unknown, elementId?: string }) => Number(!!value.selector) + Number(!!value.elementId) === 1
const assertion = z.union([
  z.object({ kind: z.literal('element_visible'), selector }).strict(),
  z.object({ kind: z.literal('element_absent'), selector }).strict(),
  z.object({ kind: z.literal('screen_fingerprint'), fingerprint: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('state_equals'), property: z.string().min(1), expected: z.union([z.boolean(), z.number().finite(), z.string()]), ...target }).strict().refine(exactlyOneTarget)
])
const id = z.string().min(1)
const step = z.union([
  z.object({ id, type: z.literal('start_app'), appId: z.string().min(1), verificationMode: verificationMode.optional() }).strict(),
  z.object({ id, type: z.literal('tap'), ...target, waitFor: waitFor.optional(), verificationMode: verificationMode.optional() }).strict().refine(exactlyOneTarget),
  z.object({ id, type: z.literal('wait'), selector, condition: z.enum(['exists', 'not_exists', 'visible', 'clickable']).optional(), timeoutMs, pollIntervalMs }).strict(),
  z.object({ id, type: z.literal('assert'), assertion, timeoutMs, pollIntervalMs }).strict()
])
export const tapElementControlsSchema = z.object({
  elementId: z.string().min(1).optional(), selector: selector.optional(), waitFor: waitFor.optional()
}).strict().refine(value => Number(!!value.elementId) + Number(!!value.selector) === 1 && (!value.elementId || !value.waitFor))

export const journeySchema = z.object({
  platform: z.enum(['android', 'ios']), deviceId: z.string().min(1).optional(),
  responseMode: z.enum(['compact', 'debug']).default('compact'), captureOnFailure: z.boolean().default(false),
  defaults: z.object({ verificationMode: verificationMode.optional(), actionTimeoutMs: z.number().int().finite().optional(), verificationTimeoutMs: z.number().int().finite().optional() }).strict().optional(),
  steps: z.array(step).min(1).max(50)
}).strict().refine(value => new Set(value.steps.map(step => step.id)).size === value.steps.length, 'Step IDs must be unique')

const selectorJson = { type: 'object', additionalProperties: false, properties: {
  text: { type: 'string', minLength: 1 }, resource_id: { type: 'string', minLength: 1 }, accessibility_id: { type: 'string', minLength: 1 }, contains: { type: 'boolean' }
}, anyOf: ['text', 'resource_id', 'accessibility_id'].map(key => ({ required: [key] })) }
const targetJson = { selector: selectorJson, elementId: { type: 'string', minLength: 1 } }
const oneTargetJson = [{ required: ['selector'], not: { required: ['elementId'] } }, { required: ['elementId'], not: { required: ['selector'] } }]
const intervalJson = { timeoutMs: { type: 'integer', minimum: 100, maximum: 60000 }, pollIntervalMs: { type: 'integer', minimum: 50, maximum: 1000 } }
const modeJson = { type: 'string', enum: ['none', 'light', 'full'] }
const objectJson = (properties: Record<string, unknown>, required: string[], extra = {}) => ({ type: 'object', additionalProperties: false, properties, required, ...extra })
export const journeyStepsJson = {
  type: 'array', minItems: 1, maxItems: 50, items: { oneOf: [
    objectJson({ id: { type: 'string', minLength: 1 }, type: { const: 'start_app' }, appId: { type: 'string', minLength: 1 }, verificationMode: modeJson }, ['id', 'type', 'appId']),
    objectJson({ id: { type: 'string', minLength: 1 }, type: { const: 'tap' }, ...targetJson, verificationMode: modeJson,
      waitFor: objectJson({ ...intervalJson, timeoutMs: { type: 'integer', minimum: 100, maximum: 10000 }, condition: { enum: ['exists', 'visible', 'clickable'] }, match: objectJson({ index: { type: 'integer', minimum: 0 } }, []) }, [])
    }, ['id', 'type'], { oneOf: oneTargetJson }),
    objectJson({ id: { type: 'string', minLength: 1 }, type: { const: 'wait' }, selector: selectorJson, condition: { enum: ['exists', 'not_exists', 'visible', 'clickable'] }, ...intervalJson }, ['id', 'type', 'selector']),
    objectJson({ id: { type: 'string', minLength: 1 }, type: { const: 'assert' }, ...intervalJson, assertion: { oneOf: [
      objectJson({ kind: { const: 'element_visible' }, selector: selectorJson }, ['kind', 'selector']),
      objectJson({ kind: { const: 'element_absent' }, selector: selectorJson }, ['kind', 'selector']),
      objectJson({ kind: { const: 'screen_fingerprint' }, fingerprint: { type: 'string', minLength: 1 } }, ['kind', 'fingerprint']),
      objectJson({ kind: { const: 'state_equals' }, ...targetJson, property: { type: 'string', minLength: 1 }, expected: { type: ['boolean', 'number', 'string'] } }, ['kind', 'property', 'expected'], { oneOf: oneTargetJson })
    ] } }, ['id', 'type', 'assertion'])
  ] }
}
