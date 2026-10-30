import { z } from 'zod'

export const conditionalTools = new Set(['tap', 'tap_element', 'swipe', 'type_text', 'press_back'])
export const expectedStateSchema = z.object({
  snapshotSessionId: z.string().min(1),
  snapshotRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  timeoutMs: z.number().int().min(100).max(60000).optional()
}).strict()

export type ExpectedState = z.infer<typeof expectedStateSchema>

export const expectedStateJson = {
  type: 'object', additionalProperties: false,
  properties: {
    snapshotSessionId: { type: 'string', minLength: 1 },
    snapshotRevision: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    timeoutMs: { type: 'integer', minimum: 100, maximum: 60000, default: 15000 }
  },
  required: ['snapshotSessionId', 'snapshotRevision']
}

export function validateExpectedState(name: string, args: Record<string, unknown>): ExpectedState | undefined {
  if (args.expectedState === undefined) return undefined
  if (!conditionalTools.has(name)) throw new Error('INVALID_ARGUMENT: expectedState is not supported on this tool')
  const parsed = expectedStateSchema.safeParse(args.expectedState)
  if (!parsed.success) throw new Error('INVALID_ARGUMENT: invalid expectedState')
  if ((args.platform !== 'android' && args.platform !== 'ios') ||
      typeof args.deviceId !== 'string' || !args.deviceId.trim() ||
      ['booted', 'default'].includes(args.deviceId)) throw new Error('INVALID_ARGUMENT: expectedState requires an explicit platform and concrete deviceId')
  if (['type_text', 'press_back'].includes(name) && args.platform !== 'android') throw new Error('INVALID_ARGUMENT: this action supports only Android')
  return parsed.data
}
