import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export interface EvidenceDevice { platform: 'android' | 'ios'; id: string }
export interface ActionRef { sessionId: string; actionId: string }
type Kind = 'screenshot' | 'ui_tree' | 'fingerprint' | 'activity' | 'logs'
type Freshness = 'fresh' | 'stale' | 'unknown' | 'not_applicable'
interface Stamp { wall: number; mono: number }
interface DeviceOrder { sequence: number; active: number; lastStarted: number }
interface ActionRecord {
  id: string; correlationId: string; device: EvidenceDevice | null
  dispatchStart: Stamp | null; dispatchEnd: Stamp | null; verification: Stamp | null; completed: number | null
}
interface Component {
  evidence_id: string; kind: Kind; status: 'captured' | 'failed' | 'omitted'
  capture_started_at_ms: number | null; capture_completed_at_ms: number | null
  source_captured_at_ms: number | null; age_ms: number | null
  freshness: Freshness; freshness_reasons: string[]
  device: EvidenceDevice | null; snapshot_session_id?: string; snapshot_revision?: number
  error?: unknown; clock?: 'device_or_unknown'; event_time_comparable?: false
  earliest_entry_at_ms?: number | null; latest_entry_at_ms?: number | null
}
interface Acquisition {
  value: Component; start: Stamp; end: Stamp | null; order: DeviceOrder | null
  startSequence: number; endSequence: number; overlapping: boolean; reused: boolean
}
interface EvidenceContext {
  systemTraceId?: string
  correlationId: string; action: ActionRecord | null; ref?: ActionRef
  device: EvidenceDevice | null; start: Stamp; end: Stamp | null; verification: Stamp | null
  observations: Acquisition[]; isAction: boolean; children: EvidenceContext[]
}
const sessionId = randomUUID()
const context = new AsyncLocalStorage<EvidenceContext>()
const history = new Map<string, ActionRecord>()
const active = new Map<string, ActionRecord>()
const orders = new Map<string, DeviceOrder>()
const stamp = (): Stamp => ({ wall: Date.now(), mono: performance.now() })
const deviceKey = (d: EvidenceDevice) => `${d.platform}:${d.id}`
const sameDevice = (a: EvidenceDevice | null, b: EvidenceDevice | null) => !!a && !!b && deviceKey(a) === deviceKey(b)
function validDevice(d: any): EvidenceDevice | null {
  return d && ['android', 'ios'].includes(d.platform) && typeof d.id === 'string' && d.id && !['default', 'booted'].includes(d.id)
    ? { platform: d.platform, id: d.id } : null
}
function orderFor(device: EvidenceDevice | null) {
  if (!device) return null
  const key = deviceKey(device)
  let order = orders.get(key)
  if (!order) {
    order = { sequence: 0, active: 0, lastStarted: -Infinity }
    orders.set(key, order)
    if (orders.size > 1000) {
      for (const [oldKey, oldOrder] of orders) {
        if (oldKey !== key && oldOrder.active === 0) orders.delete(oldKey)
        if (orders.size <= 1000) break
      }
    }
  }
  return order
}
function prune() {
  const now = performance.now()
  for (const [key, record] of history) {
    if (record.completed !== null && now - record.completed >= 600000) history.delete(key)
  }
  while (history.size > 1000) history.delete(history.keys().next().value!)
}
export function validateActionRef(value: unknown): ActionRef | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['sessionId', 'actionId'].includes(key))) throw new Error('INVALID_ARGUMENT: invalid actionRef')
  const ref = value as ActionRef
  for (const v of [ref.sessionId, ref.actionId]) if (typeof v !== 'string' || v.length < 1 || v.length > 128) throw new Error('INVALID_ARGUMENT: invalid actionRef')
  return { sessionId: ref.sessionId, actionId: ref.actionId }
}
export function evidenceSessionId() { return sessionId }
export function currentEvidenceCorrelationId() { return context.getStore()?.correlationId }
export function bindSystemTrace(traceId: string) {
  const current = context.getStore()
  if (current) current.systemTraceId = traceId
}
export function currentEvidenceActionId() { return context.getStore()?.action?.id }
export function bindEvidenceDevice(device: { platform: string; id: string }) {
  const current = context.getStore()
  const target = validDevice(device)
  if (!current || !target) return
  current.device ??= target
  if (current.isAction && current.action) current.action.device ??= target
}
export function markEvidenceVerification() {
  const current = context.getStore()
  if (current) {
    current.verification = stamp()
    if (current.isAction && current.action) current.action.verification = current.verification
  }
}
export async function evidenceDispatch<T>(device: EvidenceDevice, operation: () => Promise<T>): Promise<T> {
  const current = context.getStore()
  if (!current?.isAction || !current.action) return operation()
  bindEvidenceDevice(device)
  const record = current.action
  const start = stamp()
  record.dispatchStart ??= start
  record.dispatchEnd = null
  const order = orderFor(validDevice(device))
  if (order) { order.sequence++; order.active++; order.lastStarted = start.mono }
  try { return await operation() }
  finally {
    record.dispatchEnd = stamp()
    if (order) order.active--
  }
}
export function omitEvidence(kind: Kind) {
  const current = context.getStore()
  if (!current) return
  const start = stamp()
  current.observations.push({ value: {
    evidence_id: randomUUID(), kind, status: 'omitted', capture_started_at_ms: null,
    capture_completed_at_ms: null, source_captured_at_ms: null, age_ms: null,
    freshness: kind === 'logs' ? 'not_applicable' : 'unknown', freshness_reasons: [], device: current.device
  }, start, end: null, order: null, startSequence: 0, endSequence: 0, overlapping: false, reused: false })
}
export async function captureEvidence<T>(kind: Kind, device: EvidenceDevice | null, operation: () => Promise<T>): Promise<T> {
  const current = context.getStore()
  if (!current) return operation()
  const target = validDevice(device)
  if (target) bindEvidenceDevice(target)
  const order = orderFor(target)
  const start = stamp()
  const acquisition: Acquisition = { value: {
    evidence_id: randomUUID(), kind, status: 'failed', capture_started_at_ms: start.wall,
    capture_completed_at_ms: null, source_captured_at_ms: null, age_ms: null,
    freshness: 'unknown', freshness_reasons: [], device: target
  }, start, end: null, order, startSequence: order?.sequence ?? 0,
  endSequence: 0, overlapping: !!order?.active, reused: false }
  current.observations.push(acquisition)
  try {
    const result = await operation() as any
    const value = acquisition.value
    const resolved = validDevice(result?.device) ?? target
    value.device = resolved
    if (resolved) bindEvidenceDevice(resolved)
    const failure = result?.error ?? result?.meta?.error
    value.status = failure || result?.success === false || (kind === 'fingerprint' && !result?.fingerprint) ? 'failed' : 'captured'
    if (failure) value.error = failure
    const source = result?.captured_at_ms
    if (Number.isFinite(source) && source > 0) {
      value.source_captured_at_ms = source
      acquisition.reused = source < start.wall
    }
    if (kind === 'ui_tree') {
      value.snapshot_session_id = result?.snapshot_session_id
      value.snapshot_revision = result?.snapshot_revision
    }
    if (kind === 'logs') {
      const entries = result?.logs ?? result?.entries ?? []
      const times = entries.map((e: any) => {
        const t = e?.timestamp ?? e?._iso
        return typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(t) : NaN
      }).filter((t: number) => Number.isFinite(t)) as number[]
      value.clock = 'device_or_unknown'; value.event_time_comparable = false
      value.earliest_entry_at_ms = times.length ? times.reduce((a, b) => Math.min(a, b)) : null
      value.latest_entry_at_ms = times.length ? times.reduce((a, b) => Math.max(a, b)) : null
    }
    return result
  } catch (error) {
    acquisition.value.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    acquisition.end = stamp()
    acquisition.value.capture_completed_at_ms = acquisition.end.wall
    acquisition.endSequence = order?.sequence ?? 0
    acquisition.overlapping ||= !!order?.active || acquisition.startSequence !== acquisition.endSequence
    if (acquisition.value.status === 'captured' && acquisition.value.source_captured_at_ms === null && kind !== 'logs') {
      acquisition.value.source_captured_at_ms = acquisition.end.wall
    }
  }
}
function association(current: EvidenceContext) {
  if (current.isAction) return { association: 'self', association_reason: null }
  if (!current.ref) return { association: 'none', association_reason: null }
  const reason = current.ref.sessionId !== sessionId ? 'SESSION_MISMATCH' : !current.action ? 'ACTION_UNAVAILABLE' :
    !sameDevice(current.device, current.action.device) ? 'DEVICE_MISMATCH' : null
  return { association: reason ? 'unavailable' : 'explicit', association_reason: reason }
}
function assemble(current: EvidenceContext) {
  const end = stamp()
  const link = association(current)
  const action = link.association === 'unavailable' ? null : current.action
  const clockChanged = end.wall < current.start.wall
  const observations = current.observations.map(a => {
    const v = { ...a.value, freshness_reasons: [] as string[] }
    if (v.status === 'omitted') return v
    const componentAction = sameDevice(v.device, action?.device ?? null) ? action : null
    const sourceMono = a.end && v.source_captured_at_ms !== null ? a.end.mono + v.source_captured_at_ms - a.end.wall : a.end?.mono
    const reason = (freshness: Freshness, code: string) => { v.freshness = freshness; v.freshness_reasons.push(code) }
    if (v.kind === 'logs') reason('unknown', 'DEVICE_CLOCK_UNVERIFIED')
    else if (clockChanged || (a.end && a.end.wall < a.start.wall)) reason('unknown', 'CLOCK_DISCONTINUITY')
    else if (v.source_captured_at_ms !== null && a.end && v.source_captured_at_ms > a.end.wall) reason('unknown', 'CLOCK_DISCONTINUITY')
    else if (!v.device || !a.order || orders.get(deviceKey(v.device)) !== a.order || v.status !== 'captured' || !a.end) reason('unknown', 'CAPTURE_TIME_UNKNOWN')
    else if (componentAction?.dispatchStart && sourceMono !== undefined && sourceMono < componentAction.dispatchStart.mono) reason('stale', 'BEFORE_ACTION')
    else if (a.order && (a.order.sequence > a.endSequence || (a.reused && sourceMono !== undefined && sourceMono < a.order.lastStarted))) reason('stale', 'SUPERSEDED_BY_ACTION')
    else if (a.overlapping) reason('unknown', 'OVERLAPPING_ACTION')
    else if (a.reused) reason('unknown', 'REUSED_OBSERVATION')
    else { v.freshness = 'fresh' }
    if (!clockChanged && a.end && a.end.wall >= a.start.wall && v.source_captured_at_ms !== null && v.source_captured_at_ms <= end.wall) {
      v.age_ms = Math.max(0, end.mono - a.end.mono + a.end.wall - v.source_captured_at_ms)
    }
    return { ...v, session_id: sessionId, correlation_id: componentAction?.correlationId ?? current.correlationId,
      action_id: componentAction?.id ?? null, association: componentAction ? 'internal' : link.association }
  })
  return {
    session_id: sessionId, correlation_id: action?.correlationId ?? current.correlationId,
    action_id: action?.id ?? null, device: current.device, ...link,
    ...(current.ref ? { requested_action_ref: current.ref } : {}),
    operation_started_at_ms: current.start.wall, operation_completed_at_ms: current.end?.wall ?? end.wall,
    dispatch_started_at_ms: action?.dispatchStart?.wall ?? null,
    dispatch_completed_at_ms: action?.dispatchEnd?.wall ?? null,
    verification_completed_at_ms: current.verification?.wall ?? action?.verification?.wall ?? null,
    observations, trace_context: { supported: !!current.systemTraceId, trace_id: current.systemTraceId ?? null, markers: [] }
  }
}
export async function withEvidence<T>(options: { action?: boolean; journey?: boolean; ref?: ActionRef }, operation: () => Promise<T>): Promise<{ result: T; evidence: ReturnType<typeof assemble> }> {
  prune()
  const parent = context.getStore()
  const id = randomUUID()
  const record: ActionRecord | null = options.action ? { id, correlationId: parent?.correlationId ?? id, device: null,
    dispatchStart: null, dispatchEnd: null, verification: null, completed: null } : options.ref?.sessionId === sessionId ? active.get(options.ref.actionId) ?? history.get(options.ref.actionId) ?? null : null
  const current: EvidenceContext = { systemTraceId: parent?.systemTraceId, correlationId: options.action ? record!.correlationId : options.journey ? id : randomUUID(),
    action: record, ref: options.ref, device: null, start: stamp(), end: null, verification: null, observations: [], children: [], isAction: !!options.action }
  if (options.action && record) active.set(id, record)
  if (parent && options.action) parent.children.push(current)
  try {
    return await context.run(current, async () => {
      const result = await operation()
      current.end = stamp()
      return { result, evidence: assemble(current) }
    })
  } finally {
    if (options.action && record) {
      active.delete(id); record.completed = performance.now(); history.set(id, record); prune()
    }
  }
}

export function refreshJourneyEvidence(steps: Array<{ result?: { evidence?: unknown } | null }>) {
  const current = context.getStore()
  if (!current) return
  for (const step of steps) {
    const previous = step.result?.evidence as { action_id?: string } | undefined
    const child = current.children.find(c => c.action?.id === previous?.action_id)
    if (child && step.result) step.result.evidence = assemble(child)
  }
}

export function completeJourneyVerification(actionId: string) {
  const child = context.getStore()?.children.find(c => c.action?.id === actionId)
  if (child?.action) {
    child.verification = stamp()
    child.action.verification = child.verification
  }
}
