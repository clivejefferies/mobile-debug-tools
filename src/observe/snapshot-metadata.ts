import crypto from 'crypto'
import type { GetUITreeResponse, LoadingState, SnapshotDelta, UIElement } from '../types.js'

interface SnapshotState {
  revision: number
  signature: string | null
  elementSignatures: Map<string, string>
  elements: Map<string, UIElement>
  history: Map<number, Map<string, UIElement>>
  historyTimes: Map<number, number>
  oversized: Map<number, number>
  previousRevision: number | null
  updatedAt: number
}

let nextRevision = 1
const snapshotStateByDevice = new Map<string, SnapshotState>()

function normalize(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().toLowerCase()
}

function normalizeBounds(bounds: unknown): [number, number, number, number] | null {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const normalized = bounds.slice(0, 4).map((value) => Number(value))
  if (normalized.some((value) => Number.isNaN(value))) return null
  return normalized as [number, number, number, number]
}

function stableElementSignature(element: UIElement) {
  return {
    text: normalize(element.text),
    contentDescription: normalize(element.contentDescription),
    resourceId: normalize(element.resourceId),
    type: normalize(element.type),
    stable_id: normalize(element.stable_id),
    role: normalize(element.role),
    test_tag: normalize(element.test_tag),
    selector: normalize(element.selector?.value),
    clickable: !!element.clickable,
    enabled: !!element.enabled,
    visible: !!element.visible,
    state: element.state ?? null,
    bounds: normalizeBounds(element.bounds)
  }
}

function stableElementIdentity(element: UIElement, index: number) {
  const stableId = normalize(element.stable_id)
  if (stableId) return `stable:${stableId}`

  return `fallback:${crypto.createHash('sha1').update(JSON.stringify({
    text: normalize(element.text),
    contentDescription: normalize(element.contentDescription),
    resourceId: normalize(element.resourceId),
    type: normalize(element.type),
    bounds: normalizeBounds(element.bounds),
    index
  })).digest('hex')}`
}

function buildElementRecords(tree: Pick<GetUITreeResponse, 'elements'> | null | undefined) {
  const signatures = new Map<string, string>()
  const elementsByIdentity = new Map<string, UIElement>()
  const elements = Array.isArray(tree?.elements) ? tree!.elements! : []

  for (let index = 0; index < Math.min(elements.length, 500); index++) {
    const element = elements[index]
    if (!element) continue
    const identity = stableElementIdentity(element, index)
    signatures.set(identity, crypto.createHash('sha1').update(JSON.stringify(stableElementSignature(element))).digest('hex'))
    elementsByIdentity.set(identity, structuredClone(element))
  }

  return { signatures, elementsByIdentity }
}

function summarizeSnapshotDelta(previous: SnapshotState | undefined, currentElements: Map<string, string>): SnapshotDelta | null {
  if (!previous) return null

  let added = 0
  let removed = 0
  let mutated = 0

  for (const [identity, signature] of currentElements.entries()) {
    const previousSignature = previous.elementSignatures.get(identity)
    if (previousSignature === undefined) {
      added++
    } else if (previousSignature !== signature) {
      mutated++
    }
  }

  for (const identity of previous.elementSignatures.keys()) {
    if (!currentElements.has(identity)) removed++
  }

  return {
    previous_snapshot_revision: previous.revision,
    added_elements: added,
    removed_elements: removed,
    mutated_elements: mutated,
    total_elements: currentElements.size
  }
}

export function computeSnapshotSignature(tree: Pick<GetUITreeResponse, 'elements' | 'screen' | 'resolution' | 'error'> | null | undefined): string | null {
  if (!tree || tree.error) return null

  const payload = {
    screen: normalize(tree.screen),
    resolution: tree.resolution || { width: 0, height: 0 },
    elements: Array.isArray(tree.elements) ? tree.elements.map((element) => stableElementSignature(element)) : []
  }

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function detectLoadingState(tree: Pick<GetUITreeResponse, 'elements' | 'error'> | null | undefined, source: string): LoadingState | null {
  if (!tree || tree.error || !Array.isArray(tree.elements)) return null

  for (const element of tree.elements) {
    if (!element?.visible) continue
    const text = normalize(element?.text ?? element?.contentDescription ?? '')
    const type = normalize(element?.type ?? '')
    const combined = `${type} ${text}`
    if (/progress|spinner|loading|please wait|busy|loading indicator|skeleton|pending/.test(combined)) {
      const signal = /progress/.test(combined)
        ? 'progress_indicator'
        : /spinner/.test(combined)
          ? 'spinner'
          : /busy/.test(combined)
            ? 'busy_indicator'
            : /skeleton/.test(combined)
              ? 'skeleton'
              : 'loading_indicator'
      return { active: true, signal, source }
    }
  }

  return null
}

export function deriveSnapshotMetadata(
  deviceKey: string,
  tree: Pick<GetUITreeResponse, 'elements' | 'screen' | 'resolution' | 'error'> | null | undefined,
  source: string,
  signatureOverride?: string | null
) {
  const signature = signatureOverride ?? computeSnapshotSignature(tree)
  const existing = snapshotStateByDevice.get(deviceKey)
  const previous = existing && Date.now() - existing.updatedAt <= 10 * 60 * 1000 ? existing : undefined
  if (!previous && existing) snapshotStateByDevice.delete(deviceKey)
  const hasValidTree = !!tree && !tree.error
  const records = hasValidTree ? buildElementRecords(tree) : null
  const currentElementSignatures = records?.signatures ?? previous?.elementSignatures ?? new Map<string, string>()
  const currentElements = records?.elementsByIdentity ?? previous?.elements ?? new Map<string, UIElement>()

  const revision = previous && (signature === null || previous.signature === signature) ? previous.revision : nextRevision++
  const history = previous?.history ?? new Map<number, Map<string, UIElement>>()
  const historyTimes = previous?.historyTimes ?? new Map<number, number>()
  const oversized = previous?.oversized ?? new Map<number, number>()
  if (hasValidTree) {
    history.set(revision, currentElements)
    if (!historyTimes.has(revision)) historyTimes.set(revision, Date.now())
    if ((tree.elements?.length ?? 0) > 500) oversized.set(revision, (tree.elements?.length ?? 0) - 500)
  }
  for (const [id, timestamp] of historyTimes) {
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      history.delete(id)
      historyTimes.delete(id)
      oversized.delete(id)
    }
  }
  while (history.size > 8) {
    const oldest = history.keys().next().value
    if (oldest === undefined) break
    history.delete(oldest)
    historyTimes.delete(oldest)
    oversized.delete(oldest)
  }

  snapshotStateByDevice.set(deviceKey, {
    revision,
    signature,
    elementSignatures: currentElementSignatures,
    elements: currentElements,
    history, historyTimes, oversized, previousRevision: previous?.revision ?? null,
    updatedAt: Date.now()
  })

  return {
    snapshot_revision: revision,
    captured_at_ms: Date.now(),
    snapshot_delta: hasValidTree ? summarizeSnapshotDelta(previous, currentElementSignatures) : null,
    loading_state: detectLoadingState(tree, source)
  }
}

export function getStateDelta(deviceKey: string, baseRevision: number, currentRevision: number) {
  const state = snapshotStateByDevice.get(deviceKey)
  if (!state || Date.now() - (state.historyTimes.get(baseRevision) ?? 0) > 10 * 60 * 1000 || Date.now() - state.updatedAt > 10 * 60 * 1000) return null
  const base = state.history.get(baseRevision)
  const current = state?.history.get(currentRevision)
  if (!base || !current) return null

  const added: UIElement[] = []
  const changed: UIElement[] = []
  const removed: Array<{ stable_id?: string, resourceId?: string, contentDescription?: string, text?: string, index: number }> = []
  for (const [identity, element] of current) {
    const before = base.get(identity)
    if (!before) added.push(element)
    else if (JSON.stringify(stableElementSignature(before)) !== JSON.stringify(stableElementSignature(element))) changed.push(element)
  }
  let index = 0
  for (const [identity, element] of base) {
    if (!current.has(identity)) removed.push({ stable_id: element.stable_id ?? undefined, resourceId: element.resourceId ?? undefined, contentDescription: element.contentDescription ?? undefined, text: element.text ?? undefined, index })
    index++
  }
  const all = added.length + changed.length + removed.length
  const limit = 200
  return {
    base_snapshot_revision: baseRevision,
    snapshot_revision: currentRevision,
    added: added.slice(0, limit),
    changed: changed.slice(0, Math.max(0, limit - added.length)),
    removed: removed.slice(0, Math.max(0, limit - added.length - changed.length)),
    truncated: all > limit || state.oversized.has(baseRevision) || state.oversized.has(currentRevision),
    ...((all > limit || state.oversized.has(baseRevision) || state.oversized.has(currentRevision))
      ? { omitted_changes: Math.max(all - limit, state.oversized.get(baseRevision) ?? 0, state.oversized.get(currentRevision) ?? 0) } : {})
  }
}

export function getLatestStateDelta(deviceKey: string) {
  const state = snapshotStateByDevice.get(deviceKey)
  if (!state || state.previousRevision === null) return null
  return getStateDelta(deviceKey, state.previousRevision, state.revision)
}

export function retainConnectedDeviceSnapshots(platform: string, deviceIds: string[]) {
  const keys = new Set(deviceIds.map(id => `${platform}:${id}`))
  for (const key of snapshotStateByDevice.keys()) if (key.startsWith(`${platform}:`) && !keys.has(key)) snapshotStateByDevice.delete(key)
}

export function clearDeviceSnapshots(deviceKey: string) {
  snapshotStateByDevice.delete(deviceKey)
}

export function resetSnapshotMetadataForTests() {
  snapshotStateByDevice.clear()
  nextRevision = 1
}
