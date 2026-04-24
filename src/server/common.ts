import type {
  ActionExecutionResult,
  ActionFailureCode,
  ActionTargetResolved
} from '../types.js'
import { ToolsObserve } from '../observe/index.js'

export function wrapResponse<T>(data: T) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(data, null, 2)
    }]
  }
}

export type ToolCallArgs = Record<string, unknown>
export type ToolCallResult = Awaited<ReturnType<typeof wrapResponse>> | {
  content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>
}
export type ToolHandler = (args: ToolCallArgs) => Promise<ToolCallResult>

export function getStringArg(args: ToolCallArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

export function requireStringArg(args: ToolCallArgs, key: string): string {
  const value = getStringArg(args, key)
  if (value === undefined) throw new Error(`Missing or invalid string argument: ${key}`)
  return value
}

export function getNumberArg(args: ToolCallArgs, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function requireNumberArg(args: ToolCallArgs, key: string): number {
  const value = getNumberArg(args, key)
  if (value === undefined) throw new Error(`Missing or invalid number argument: ${key}`)
  return value
}

export function getBooleanArg(args: ToolCallArgs, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

export function getObjectArg<T extends Record<string, unknown>>(args: ToolCallArgs, key: string): T | undefined {
  const value = args[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as T
}

export function requireObjectArg<T extends Record<string, unknown>>(args: ToolCallArgs, key: string): T {
  const value = getObjectArg<T>(args, key)
  if (value === undefined) throw new Error(`Missing or invalid object argument: ${key}`)
  return value
}

export function getArrayArg<T>(args: ToolCallArgs, key: string): T[] | undefined {
  const value = args[key]
  return Array.isArray(value) ? value as T[] : undefined
}

let actionSequence = 0

export function nextActionId(actionType: string, timestamp: number) {
  actionSequence += 1
  return `${actionType}_${timestamp}_${actionSequence}`
}

export async function captureActionFingerprint(platform?: 'android' | 'ios', deviceId?: string): Promise<string | null> {
  if (!platform) return null
  try {
    const result = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId }) as any
    return result?.fingerprint ?? null
  } catch {
    return null
  }
}

export function normalizeResolvedTarget(value: Partial<ActionTargetResolved> | null = null): ActionTargetResolved | null {
  if (!value) return null
  return {
    elementId: value.elementId ?? null,
    text: value.text ?? null,
    resource_id: value.resource_id ?? null,
    accessibility_id: value.accessibility_id ?? null,
    class: value.class ?? null,
    bounds: value.bounds ?? null,
    index: value.index ?? null
  }
}

export function inferGenericFailure(message: string | undefined): { failureCode: ActionFailureCode; retryable: boolean } {
  if (message && /timeout/i.test(message)) return { failureCode: 'TIMEOUT', retryable: true }
  return { failureCode: 'UNKNOWN', retryable: false }
}

export function inferScrollFailure(message: string | undefined): { failureCode: ActionFailureCode; retryable: boolean } {
  if (message && /unchanged|no change|end of list/i.test(message)) return { failureCode: 'NAVIGATION_NO_CHANGE', retryable: true }
  if (message && /timeout/i.test(message)) return { failureCode: 'TIMEOUT', retryable: true }
  return { failureCode: 'UNKNOWN', retryable: false }
}

export function buildActionExecutionResult({
  actionType,
  device,
  selector,
  resolved,
  success,
  uiFingerprintBefore,
  uiFingerprintAfter,
  failure,
  details
}: {
  actionType: string
  device?: ActionExecutionResult['device']
  selector: Record<string, unknown> | null
  resolved?: Partial<ActionTargetResolved> | null
  success: boolean
  uiFingerprintBefore: string | null
  uiFingerprintAfter: string | null
  failure?: { failureCode: ActionFailureCode; retryable: boolean }
  details?: Record<string, unknown>
}): ActionExecutionResult {
  const timestampMs = Date.now()
  const timestamp = new Date(timestampMs).toISOString()
  return {
    action_id: nextActionId(actionType, timestampMs),
    timestamp,
    action_type: actionType,
    ...(device ? { device } : {}),
    target: {
      selector,
      resolved: normalizeResolvedTarget(resolved)
    },
    success,
    ...(failure ? { failure_code: failure.failureCode, retryable: failure.retryable } : {}),
    ui_fingerprint_before: uiFingerprintBefore,
    ui_fingerprint_after: uiFingerprintAfter,
    ...(details ? { details } : {})
  }
}

export function wrapToolError(name: string, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
      ? (() => {
          try {
            return JSON.stringify(error, null, 2)
          } catch {
            return '[unserializable error object]'
          }
        })()
      : String(error)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: {
          tool: name,
          message
        }
      }, null, 2)
    }]
  }
}
