import { z } from 'zod'

export type UiSelector = {
  text?: string
  resource_id?: string
  accessibility_id?: string
  contains?: boolean
}

export const selectorSchema = z.object({
  text: z.string().min(1).optional(), resource_id: z.string().min(1).optional(),
  accessibility_id: z.string().min(1).optional(), contains: z.boolean().optional()
}).strict().refine(value => !!(value.text || value.resource_id || value.accessibility_id), 'Selector requires a target')

export const selectorJson = { type: 'object', additionalProperties: false, properties: {
  text: { type: 'string', minLength: 1 }, resource_id: { type: 'string', minLength: 1 }, accessibility_id: { type: 'string', minLength: 1 }, contains: { type: 'boolean' }
}, anyOf: ['text', 'resource_id', 'accessibility_id'].map(key => ({ required: [key] })) }
