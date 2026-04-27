import crypto from 'crypto'
import type { GetUITreeResponse, LoadingState, UIElement } from '../types.js'

interface SnapshotState {
  revision: number
  signature: string | null
}

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
  const previous = snapshotStateByDevice.get(deviceKey)

  let revision = 1
  if (previous) {
    if (signature === null) {
      revision = previous.revision
    } else {
      revision = previous.signature === signature ? previous.revision : previous.revision + 1
    }
  }

  snapshotStateByDevice.set(deviceKey, { revision, signature })

  return {
    snapshot_revision: revision,
    captured_at_ms: Date.now(),
    loading_state: detectLoadingState(tree, source)
  }
}

export function resetSnapshotMetadataForTests() {
  snapshotStateByDevice.clear()
}
