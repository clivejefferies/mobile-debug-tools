export interface SnapshotLogEntry { timestamp: number | null; level: string; message: string }
interface LogFields { message?: string; msg?: string; level?: string; levelName?: string; _level?: string; timestamp?: string | number; _iso?: string }
function levelOf(message: string, raw: string | undefined, stream: boolean) {
  return (raw && String(raw).toUpperCase()) || (stream
    ? /\bERROR\b/i.test(message) ? 'ERROR' : /\bWARN\b/i.test(message) ? 'WARN' : 'INFO'
    : /\b(FATAL EXCEPTION|ERROR| E )\b/i.test(message) ? 'ERROR' : /\b(WARN| W )\b/i.test(message) ? 'WARN' : 'INFO')
}
export function snapshotLog(item: unknown): SnapshotLogEntry {
  if (!item) return { timestamp: null, level: 'INFO', message: '' }
  if (typeof item === 'string') return { timestamp: null, level: levelOf(item, undefined, false), message: item }
  const fields = item as LogFields
  const message = fields.message || fields.msg || JSON.stringify(item)
  const raw = fields.level || fields.levelName || fields._level || ''
  const time = fields.timestamp || fields._iso || null
  const timestamp = time && typeof time === 'string' ? (isNaN(new Date(time).getTime()) ? null : new Date(time).getTime()) : typeof time === 'number' ? time : null
  return { timestamp, level: levelOf(message, raw, true), message }
}
export function streamLog(item: unknown): SnapshotLogEntry {
  const fields = item as LogFields | null
  const message = fields && (fields.message || fields.msg) ? fields.message || fields.msg! : typeof item === 'string' ? item : JSON.stringify(item)
  const raw = fields && (fields.level || fields.levelName || fields._level) ? fields.level || fields.levelName || fields._level : ''
  const iso = fields && (fields._iso || fields.timestamp)
  let timestamp: number | null = null
  if (iso && typeof iso === 'string') { const date = new Date(iso); if (!isNaN(date.getTime())) timestamp = date.getTime() }
  return { timestamp, level: levelOf(message, raw, true), message }
}
