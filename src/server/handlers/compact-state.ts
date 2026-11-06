export type Payload = Record<string, unknown>
export function object(value: unknown): Payload {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Payload : {}
}
export function pick(value: unknown, keys: string[]): Payload {
  const source = object(value)
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]))
}
export function boundedValue(value: unknown): unknown {
  if (typeof value !== 'string') return ['number', 'boolean'].includes(typeof value) || value === null ? value : undefined
  let text = ''
  for (const char of value) {
    if (Buffer.byteLength(text + char) > 128) break
    text += char
  }
  return text
}
export function observedState(evidence: unknown, dispatchStarted = false): Payload {
  const e = object(evidence), device = object(e.device)
  const observations = Array.isArray(e.observations) ? e.observations.map(object) : []
  const candidates = observations.filter(o => ['ui_tree', 'fingerprint', 'screenshot'].includes(String(o.kind)))
  const last = candidates.at(-1)
  if (!last) return { status: 'unknown', reason: 'NO_POST_ACTION_OBSERVATION' }
  const summary = pick(last, ['kind', 'source_captured_at_ms', 'freshness', 'snapshot_session_id', 'snapshot_revision'])
  summary.captured_at_ms = summary.source_captured_at_ms ?? null
  delete summary.source_captured_at_ms
  const same = object(last.device).id === device.id && object(last.device).platform === device.platform && !!device.id
  const post = typeof e.dispatch_completed_at_ms === 'number' && typeof last.capture_started_at_ms === 'number' && last.capture_started_at_ms >= e.dispatch_completed_at_ms
  if (typeof last.source_captured_at_ms !== 'number' || last.source_captured_at_ms <= 0) return { status: 'unknown', reason: 'CAPTURE_TIME_UNKNOWN', ...summary }
  if (last.status === 'captured' && last.freshness === 'fresh' && same && (!dispatchStarted || post)) return { status: 'observed', ...summary }
  return { status: 'unknown', reason: !same ? 'DEVICE_MISMATCH' : !post && dispatchStarted ? 'NO_POST_ACTION_OBSERVATION' : 'OBSERVATION_UNAVAILABLE', ...summary }
}
export function deltaSummary(value: unknown) {
  const delta = object(value)
  return { ...pick(delta, ['base_snapshot_revision', 'snapshot_revision', 'truncated', 'omitted_changes']),
    ...Object.fromEntries(['added', 'removed', 'changed'].map(key => [key, Array.isArray(delta[key]) ? delta[key].length : 0])) }
}

export function boundedState(value: unknown): unknown {
  if (!value || typeof value !== 'object') return boundedValue(value)
  const fields = pick(value, ['property', 'value', 'raw_value', 'checked', 'selected', 'expanded', 'enabled', 'text_value'])
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, boundedValue(item)]).filter(([, item]) => item !== undefined))
}
