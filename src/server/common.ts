import { recordTiming } from '../utils/timing.js'
export function wrapResponse<T>(data: T, includeSerializationTiming = true) {
  const start = performance.now()
  let text = JSON.stringify(data, null, 2)
  const elapsed = performance.now() - start
  const value = data as any
  if (includeSerializationTiming && value && typeof value === 'object' && value.timing && typeof value.timing === 'object') {
    value.timing.serialization_ms = (value.timing.serialization_ms ?? 0) + elapsed
    recordTiming('serialization_ms', elapsed)
    text = JSON.stringify(value, null, 2)
  }
  return { content: [{ type: 'text' as const, text }] }
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

export function requireBooleanArg(args: ToolCallArgs, key: string): boolean {
  const value = getBooleanArg(args, key)
  if (value === undefined) throw new Error(`Missing or invalid boolean argument: ${key}`)
  return value
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

export { DEFAULT_MAX_RECOVERY_ATTEMPTS, DEFAULT_MAX_RETRY_DEPTH, nextActionId, captureActionFingerprint, createTraceStep, buildActionTrace, normalizeResolvedTarget, inferGenericFailure, inferScrollFailure, determineActionLifecycleState, buildActionExecutionResult } from '../runtime/action-results.js'
