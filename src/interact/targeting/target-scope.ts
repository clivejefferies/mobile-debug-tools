import type { UiElement, UiChangeScopeResult, ResolvedUiElementContext } from '../model.js'
import { _normalize, _computeElementId } from './element-helpers.js'
import { _collectSubtreeIndices } from '../waits/ui-change-helpers.js'

export interface ScopeTree { elements?: UiElement[]; device?: { platform?: string; id?: string } }
type StoreReader = { get(id: string): ResolvedUiElementContext | undefined }
type ScopedMatch = { index: number; stableId: string | null; reason: string }

export function findScopedElement(tree: ScopeTree | null | undefined, targetElementId: string, store: StoreReader): { index: number, stableId: string | null, reason: string } | null {
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const platform = tree?.device?.platform === 'ios' ? 'ios' : 'android'
    const deviceId = tree?.device?.id ?? undefined
    const normalizedTarget = _normalize(targetElementId)

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!el) continue

      const computedElementId = _computeElementId(platform, deviceId, el, i)
      if (computedElementId === targetElementId) {
        return {
          index: i,
          stableId: el.stable_id ?? null,
          reason: 'element_id_match'
        }
      }
    }

    const directStable = findStableElement(elements, normalizedTarget, 'stable_id_match')
    if (directStable) return directStable
    const storedContext = store.get(targetElementId)
    return storedContext?.stable_id
      ? findStableElement(elements, _normalize(storedContext.stable_id), 'stored_stable_id_match')
      : null
  }

export function resolveUiChangeScope(
    tree: ScopeTree | null | undefined,
    scope: 'screen' | 'subtree' | undefined,
    target: string | null | undefined,
    find: (tree: ScopeTree | null | undefined, id: string) => ScopedMatch | null
  ): UiChangeScopeResult {
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const normalizedScope = scope === 'subtree' ? 'subtree' : 'screen'

    if (normalizedScope === 'screen') {
      return {
        elements,
        resolution: {
          scope: 'screen',
          target: null,
          resolved: true,
          resolvedIndex: null,
          resolvedStableId: null,
          reason: 'screen scope'
        }
      }
    }

    const requestedTarget = typeof target === 'string' && target.trim().length > 0 ? target.trim() : null
    if (!requestedTarget) {
      return {
        elements: [],
        resolution: {
          scope: 'subtree',
          target: null,
          resolved: false,
          resolvedIndex: null,
          resolvedStableId: null,
          reason: 'subtree scope requires a target element id'
        },
        error: {
          code: 'INVALID_SCOPE',
          message: 'scope=subtree requires a target element_id'
        }
      }
    }

    const resolved = find(tree, requestedTarget)
    if (!resolved) {
      return {
        elements: [],
        resolution: {
          scope: 'subtree',
          target: requestedTarget,
          resolved: false,
          resolvedIndex: null,
          resolvedStableId: null,
          reason: 'target element could not be resolved'
        },
        error: {
          code: 'ELEMENT_NOT_FOUND',
          message: `Target element ${requestedTarget} could not be resolved for subtree scope`
        }
      }
    }

    const subtreeIndices = _collectSubtreeIndices(elements, resolved.index)
    const scopedElements = subtreeIndices.map((index) => elements[index]).filter((element): element is UiElement => !!element)

    return {
      elements: scopedElements,
      resolution: {
        scope: 'subtree',
        target: requestedTarget,
        resolved: true,
        resolvedIndex: resolved.index,
        resolvedStableId: resolved.stableId,
        reason: resolved.reason
      }
    }
  }

function findStableElement(elements: UiElement[], normalizedTarget: string, reason: string): ScopedMatch | null {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!el?.stable_id) continue
    if (_normalize(el.stable_id) === normalizedTarget) return { index: i, stableId: el.stable_id, reason }
  }
  return null
}
