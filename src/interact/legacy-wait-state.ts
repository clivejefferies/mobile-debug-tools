import type { FindElementResponse, FindElementElement } from '../types.js'
import type { FindInput } from './find-element.js'
import type { DeviceTarget } from './observation.js'
export interface LegacyWaitInput extends DeviceTarget {
  type?: 'ui' | 'log' | 'screen' | 'idle'; query?: string; timeoutMs?: number; pollIntervalMs?: number
  includeSnapshotOnFailure?: boolean; match?: 'present' | 'absent'; stability_ms?: number; observationDelayMs?: number
}
export interface LegacyWaitDependencies {
  fingerprint(target: DeviceTarget): Promise<{ fingerprint: string | null } | null>
  logs(target: DeviceTarget & { lines: number }): Promise<{ logs?: unknown[] } | null>
  stream(target: DeviceTarget & { sessionId: string; limit: number }): Promise<{ entries?: unknown[] } | null>
  find(input: FindInput): Promise<FindElementResponse>
  snapshot(input: DeviceTarget & { reason: string; includeLogs: boolean }): Promise<unknown>
}
export function createLegacyWait({ type = 'ui', query, timeoutMs = 30000, pollIntervalMs = 300,
  includeSnapshotOnFailure = true, match = 'present', stability_ms = 700, observationDelayMs = 0, platform, deviceId }: LegacyWaitInput) {
  const start = Date.now()
  return { type, query: query == null ? '' : String(query), start, deadline: start + (timeoutMs || 0),
    interval: Math.max(250, Math.min(pollIntervalMs || 300, 500)), includeSnapshotOnFailure, match, stability_ms, observationDelayMs,
    target: { platform, deviceId }, initial: null as string | null, baseline: null as unknown,
    lastChange: 0, previous: null as string | null, polls: 0, matched: null as number | null,
    observed: null as boolean | null, duration: 0 }
}
export type LegacyWait = ReturnType<typeof createLegacyWait>
export function logMessages(entries: unknown[]): unknown[] {
  if (!Array.isArray(entries)) return []
  return entries.map(entry => {
    if (typeof entry === 'string') return entry
    if (entry && typeof entry === 'object') {
      const fields = entry as { message?: unknown; msg?: unknown }
      if (fields.message || fields.msg) return fields.message || fields.msg
    }
    try { return JSON.stringify(entry) } catch { return String(entry) }
  })
}
interface LegacyExtras {
  matchedElement?: FindElementElement | null
  matchedLog?: { message: unknown; raw?: unknown }
  newFingerprint?: string | null
}
export function legacySuccess(s: LegacyWait, type: string, matchSource: string, stable: number, extras: LegacyExtras = {}, condition = 'present') {
  const now = Date.now()
  return { success: true, condition, query: s.query, poll_count: s.polls, duration_ms: now - s.start,
    stable_duration_ms: stable, ...extras, matchSource, timestamp: now, type, observed_state: s.observed ?? null }
}
export const legacySleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
