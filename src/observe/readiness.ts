import type { GetUITreeResponse } from '../types.js'
import { pausedReadiness } from '../debugger/guard.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ReadinessSummary } from '../types.js'
import { remainingBudget } from '../utils/operation-budget.js'
import { computeSnapshotSignature, getSnapshotSessionId } from './snapshot-metadata.js'

const baselineLimitations = ['NORMALIZED_UI_ONLY', 'FOREGROUND_APP_UNVERIFIED', 'UNRESPONSIVE_SIGNAL_UNSUPPORTED']
const capabilities = { loading: true, transitioning: true, settled: true, unresponsive: false, debugger_paused: false }

export function isDeviceUnavailable(error: unknown) {
  return /device.*(?:not found|offline|disconnected)|no devices found|READINESS_DEVICE_UNAVAILABLE/i.test(String(error))
}

export class ReadinessTracker {
  private signature: string | null = null
  private stableSince = 0
  summary: ReadinessSummary

  constructor(private platform: string, private deviceId: string, private stabilityMs = 500) {
    this.summary = {
      state: 'unknown', scope: 'device_ui', basis: 'insufficient', captured_at_ms: null,
      sample_count: 0, stable_for_ms: 0, snapshot_session_id: null, snapshot_revision: null,
      evidence: [], limitations: [...baselineLimitations, this.platform === 'android' ? 'MANAGED_DEBUGGER_ONLY' : 'DEBUGGER_SIGNAL_UNSUPPORTED', 'INSUFFICIENT_SAMPLES'], capabilities: { ...capabilities, debugger_paused: this.platform === 'android' }
    }

  }

  unavailable(code = 'OBSERVATION_FAILED'): ReadinessSummary {
    this.signature = null
    this.summary = {
      ...this.summary, state: 'unknown', basis: 'insufficient', stable_for_ms: 0,
      sample_count: this.summary.sample_count + 1, limitations: [...baselineLimitations, this.platform === 'android' ? 'MANAGED_DEBUGGER_ONLY' : 'DEBUGGER_SIGNAL_UNSUPPORTED', code],
      evidence: [...this.summary.evidence, { code, source: 'ui_tree', captured_at_ms: null, snapshot_revision: null }].slice(-8)
    }
    return this.summary
  }

  deadline(): ReadinessSummary {
    this.summary = { ...this.summary, limitations: [...new Set([...this.summary.limitations, 'DEADLINE_EXCEEDED'])] }
    return this.summary
  }

  observe(sample: unknown, acquisitionStartedAtMs: number, now = performance.now()): ReadinessSummary {
    const paused = this.platform === 'android' ? pausedReadiness(this.deviceId) : null
    if (paused) { this.summary = paused; return this.summary }
    const tree = sample as GetUITreeResponse | null | undefined
    if (tree?.error) return this.unavailable('OBSERVATION_FAILED')
    if (!validReadinessSample(tree, this.platform, this.deviceId, acquisitionStartedAtMs)) return this.unavailable('OBSERVATION_INVALID')
    const signature = computeSnapshotSignature(tree)
    if (!signature) return this.unavailable('OBSERVATION_INVALID')
    const nativeLoading = tree.elements.some((element) => element.visible === true && ['android.widget.ProgressBar', 'ActivityIndicator', 'ProgressIndicator'].includes(element.type))
    const textLoading = tree.elements.some((element) => element.visible === true && [element.text, element.contentDescription].some(label =>
      typeof label === 'string' && /^(loading|please\s+wait)[.\s…]*$/i.test(label.trim())))
    const previous = this.signature
    const unchanged = previous === signature
    if (!unchanged || nativeLoading || textLoading) this.stableSince = now
    this.signature = signature
    const stableFor = unchanged && !nativeLoading && !textLoading ? Math.max(0, now - this.stableSince) : 0
    const state = readinessState(nativeLoading || textLoading, previous, unchanged, stableFor, this.stabilityMs)
    const code = readinessCode(nativeLoading, textLoading, state)
    this.summary = {
      state, scope: 'device_ui', basis: textLoading && !nativeLoading ? 'heuristic' : state === 'unknown' ? 'insufficient' : 'observed',
      captured_at_ms: tree.captured_at_ms, snapshot_session_id: tree.snapshot_session_id, snapshot_revision: tree.snapshot_revision,
      sample_count: this.summary.sample_count + 1, stable_for_ms: stableFor,
      evidence: [...this.summary.evidence, { code, source: 'ui_tree', captured_at_ms: tree.captured_at_ms, snapshot_revision: tree.snapshot_revision }].slice(-8),
      limitations: [...baselineLimitations, this.platform === 'android' ? 'MANAGED_DEBUGGER_ONLY' : 'DEBUGGER_SIGNAL_UNSUPPORTED', ...(state === 'unknown' ? ['INSUFFICIENT_SAMPLES'] : [])], capabilities: { ...capabilities, debugger_paused: this.platform === 'android' }
    }
    return this.summary
  }
}

function validReadinessSample(tree: GetUITreeResponse | null | undefined, platform: string, deviceId: string, acquisitionStartedAtMs: number): tree is GetUITreeResponse & { snapshot_session_id: string } {
  return !!tree && validIdentity(tree, platform, deviceId) && validFreshness(tree, acquisitionStartedAtMs) && validGeometry(tree)
}
function validIdentity(tree: GetUITreeResponse, platform: string, deviceId: string) {
  return tree.device?.platform === platform && tree.device?.id === deviceId &&
    tree.snapshot_session_id === getSnapshotSessionId() && Number.isSafeInteger(tree.snapshot_revision) && tree.snapshot_revision > 0
}
function validFreshness(tree: GetUITreeResponse, startedAtMs: number) {
  return Number.isFinite(tree.captured_at_ms) && !(tree.captured_at_ms < startedAtMs) && tree.captured_at_ms > 0
}
function validGeometry(tree: GetUITreeResponse) {
  return Array.isArray(tree.elements) && tree.elements.length > 0 && !tree.elements.some((element: unknown) => !element || typeof element !== 'object') &&
    Number.isFinite(tree.resolution?.width) && Number.isFinite(tree.resolution?.height) && tree.resolution.width > 0 && tree.resolution.height > 0
}
const waits = new AsyncLocalStorage<ReadinessTracker>()
export function currentReadinessWait() { return waits.getStore() }
export function withReadinessTracker<T>(tracker: ReadinessTracker, operation: () => Promise<T>) { return waits.run(tracker, operation) }

export function observeReadinessWait(tree: unknown, startedAtMs: number) {
  const tracker = waits.getStore()
  if (!tracker) return
  remainingBudget()
  const summary = tracker.observe(tree, startedAtMs)
  if (isDeviceUnavailable((tree as { error?: unknown } | null)?.error)) throw new Error('READINESS_DEVICE_UNAVAILABLE')
  if (summary.limitations.some(code => ['OBSERVATION_INVALID', 'OBSERVATION_FAILED'].includes(code))) throw new Error('READINESS_SAMPLE_INVALID')
}

function readinessState(loading: boolean, previous: string | null, unchanged: boolean, stableFor: number, stabilityMs: number): ReadinessSummary['state'] {
  return loading ? 'loading' : !previous ? 'unknown' : !unchanged ? 'transitioning' : stableFor >= stabilityMs ? 'settled' : 'unknown'
}
function readinessCode(nativeLoading: boolean, textLoading: boolean, state: ReadinessSummary['state']) {
  return nativeLoading ? 'NATIVE_LOADING_INDICATOR' : textLoading ? 'LOADING_LABEL' : state === 'transitioning' ? 'SNAPSHOT_CHANGED' : state === 'settled' ? 'SNAPSHOT_STABLE' : 'INSUFFICIENT_SAMPLES'
}
