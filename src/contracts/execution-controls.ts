import { z } from 'zod'

export const verificationModes = ['none', 'light', 'full'] as const
export const responseModes = ['compact', 'debug'] as const
export const verificationModeSchema = z.enum(verificationModes)
export const responseModeSchema = z.enum(responseModes)
export type VerificationMode = z.infer<typeof verificationModeSchema>
export type ResponseMode = z.infer<typeof responseModeSchema>

export const verificationModeJson = { type: 'string', enum: [...verificationModes] }
export const responseModeJson = { type: 'string', enum: [...responseModes] }

export function interactionControls(args: Record<string, unknown>) {
  const verificationMode = ((typeof args.verificationMode === 'string' ? args.verificationMode : undefined) as VerificationMode | undefined) ?? 'full'
  const responseMode = ((typeof args.responseMode === 'string' ? args.responseMode : undefined) as ResponseMode | undefined) ?? 'debug'
  if (!verificationModes.includes(verificationMode) || !responseModes.includes(responseMode)) throw new Error('INVALID_ARGUMENT')
  for (const key of ['verificationMode', 'responseMode']) if (args[key] !== undefined && typeof args[key] !== 'string') throw new Error('INVALID_ARGUMENT')
  for (const key of ['actionTimeoutMs', 'verificationTimeoutMs']) if (args[key] !== undefined && (typeof args[key] !== 'number' || !Number.isInteger(args[key]))) throw new Error('INVALID_ARGUMENT')
  const actionTimeoutMs = (typeof args.actionTimeoutMs === 'number' && Number.isFinite(args.actionTimeoutMs) ? args.actionTimeoutMs : undefined)
  const verificationTimeoutMs = (typeof args.verificationTimeoutMs === 'number' && Number.isFinite(args.verificationTimeoutMs) ? args.verificationTimeoutMs : undefined)
  return { verificationMode, responseMode,
    actionTimeoutMs: actionTimeoutMs === undefined ? undefined : Math.max(100, Math.min(30000, actionTimeoutMs)),
    verificationTimeoutMs: verificationTimeoutMs === undefined ? 3000 : Math.max(100, Math.min(60000, verificationTimeoutMs)) }

}

