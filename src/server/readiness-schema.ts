import { z } from 'zod'
const timeout = z.number().int().min(100).max(60000)
export const readinessSchema = z.object({
  platform: z.enum(['android', 'ios']), deviceId: z.string().min(1).optional(),
  timeoutMs: timeout.optional(), stabilityMs: z.number().int().min(100).max(10000).optional()
}).strict()
export const readinessWaitSchema = readinessSchema.extend({ pollIntervalMs: z.number().int().min(100).max(1000).optional() }).strict()
export const readinessPropertiesJson = {
  platform: { type: 'string', enum: ['android', 'ios'] }, deviceId: { type: 'string', minLength: 1 },
  timeoutMs: { type: 'integer', minimum: 100, maximum: 60000 },
  stabilityMs: { type: 'integer', minimum: 100, maximum: 10000, default: 500 }
}
