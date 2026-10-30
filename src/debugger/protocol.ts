/** Worker messages contain private debuggee data; never include them in errors. */
export interface WorkerEvent extends Record<string, unknown> {
  event: string
  reason?: string
  stop_id?: string
}
export type WorkerReply = Record<string, unknown>
export type WorkerMessage =
  | { kind: 'event'; value: WorkerEvent }
  | { kind: 'reply'; id: number; result: WorkerReply; error?: { code?: string } }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function parseWorkerMessage(value: unknown): WorkerMessage {
  if (!record(value)) throw new Error('INVALID_WORKER_MESSAGE')
  if (value.event) {
    if (typeof value.event !== 'string') throw new Error('INVALID_WORKER_EVENT')
    for (const field of ['reason', 'stop_id']) {
      if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error('INVALID_WORKER_EVENT')
    }
    return { kind: 'event', value: value as WorkerEvent }
  }
  if (typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id < 1) throw new Error('INVALID_WORKER_REPLY')
  if (value.error) {
    if (!record(value.error) || (value.error.code !== undefined && typeof value.error.code !== 'string')) throw new Error('INVALID_WORKER_ERROR')
    return { kind: 'reply', id: value.id, result: {}, error: value.error }
  }
  if (!record(value.result)) throw new Error('INVALID_WORKER_RESULT')
  return { kind: 'reply', id: value.id, result: value.result }
}
