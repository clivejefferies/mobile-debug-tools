import { z } from 'zod'

export const methodPattern = /^[A-Z][A-Z0-9_-]{0,23}$/
export const recordSchema = z.object({
  method: z.string().regex(methodPattern),
  host: z.string().max(253),
  capturedAt: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  status: z.number().int().min(100).max(599).optional(),
  failure: z.enum(['upstream_transport', 'connection_aborted']).optional(),
}).strict()
export type TraceRecord = z.infer<typeof recordSchema>

function encodeCursor(id: string, index: number) {
  return Buffer.from(`${id}:${index}`).toString('base64url')
}

function decodeCursor(id: string, cursor?: string) {
  if (cursor === undefined) return 0
  const [trace, raw] = Buffer.from(cursor, 'base64url').toString().split(':')
  const index = Number(raw)
  if (trace !== id || !Number.isSafeInteger(index) || index < 0 || encodeCursor(id, index) !== cursor) {
    throw new Error('HTTP_TRACE_INVALID_CURSOR')
  }
  return index
}

const recordLimit = 256

export class TraceBuffer {
  private readonly records: TraceRecord[] = []
  private count = 0
  private observed = false

  constructor(private readonly traceId: string) {}

  append(record: TraceRecord): void {
    if (this.records.length === recordLimit) this.records.shift()
    this.records.push(record)
    this.count++
    if (record.status !== undefined) this.observed = true
  }

  read(cursor: string | undefined, pageSize: number) {
    const index = decodeCursor(this.traceId, cursor)
    if (index > this.count) throw new Error('HTTP_TRACE_INVALID_CURSOR')
    const oldest = this.count - this.records.length
    const offset = Math.max(index - oldest, 0)
    const records = this.records.slice(offset, offset + pageSize)
    return {
      traceId: this.traceId,
      records,
      nextCursor: encodeCursor(this.traceId, oldest + offset + records.length),
      evicted: Math.max(oldest - index, 0),
      readiness: this.observed ? 'exchange_observed' : 'listening',
    }
  }

  clear(): void {
    this.records.length = 0
    this.count = 0
    this.observed = false
  }
}
