import { z } from 'zod'
import { selectorSchema as selector, selectorJson } from './selector.js'

export interface DeviceTarget { platform?: 'android' | 'ios'; deviceId?: string }
export type ScrollSelector = { text?: string; resourceId?: string; contentDesc?: string; className?: string }
const pollIntervalMs = z.number().int().min(50).max(1000).optional()
export const waitForSchema = z.object({
  condition: z.enum(['exists', 'visible', 'clickable']).optional(),
  timeoutMs: z.number().int().min(100).max(10000).optional(), pollIntervalMs,
  match: z.object({ index: z.number().int().nonnegative().optional() }).strict().optional()
}).strict()
export const targetFields = { selector: selector.optional(), elementId: z.string().min(1).optional() }
export const exactlyOneTarget = (value: { selector?: unknown, elementId?: string }) => Number(!!value.selector) + Number(!!value.elementId) === 1
export const tapElementControlsSchema = z.object({
  elementId: z.string().min(1).optional(), selector: selector.optional(), waitFor: waitForSchema.optional()
}).strict().refine(value => Number(!!value.elementId) + Number(!!value.selector) === 1 && (!value.elementId || !value.waitFor))

export const targetJson = { selector: selectorJson, elementId: { type: 'string', minLength: 1 } }
export const oneTargetJson = [{ required: ['selector'], not: { required: ['elementId'] } }, { required: ['elementId'], not: { required: ['selector'] } }]
