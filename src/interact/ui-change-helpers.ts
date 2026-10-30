import { computeSnapshotSignature } from '../observe/snapshot-metadata.js'
import type { UIElementState } from '../types.js'
import type { UiElement, UiChangeSignatureSet } from './model.js'
const _uiChangeKinds: Array<'hierarchy_diff' | 'text_change' | 'state_change'> = ['hierarchy_diff', 'text_change', 'state_change']
import { _normalize, _normalizeBounds, _hash, _resolveParentIndex } from './element-helpers.js'

export function _collectSubtreeIndices(elements: UiElement[], rootIndex: number): number[] {
    if (!Array.isArray(elements) || rootIndex < 0 || rootIndex >= elements.length) return []

    const visited = new Set<number>()
    const stack = [rootIndex]
    const result: number[] = []

    while (stack.length > 0) {
      const index = stack.pop()
      if (index === undefined || visited.has(index) || index < 0 || index >= elements.length) continue
      visited.add(index)
      result.push(index)

      const element = elements[index]
      if (!element) continue

      const directChildren = childIndices(elements, element, index)

      for (const childIndex of directChildren) {
        if (!visited.has(childIndex)) stack.push(childIndex)
      }
    }

    return result.sort((left, right) => left - right)
  }

export function _changeIdentityForElement(el: UiElement, index: number): string {
    const stableId = _normalize(el.stable_id)
    if (stableId) return `stable:${stableId}`

    return `fallback:${_hash({
      text: _normalize(el.text ?? el.label ?? el.value ?? ''),
      contentDescription: _normalize(el.contentDescription ?? el.contentDesc ?? el.accessibilityLabel ?? ''),
      resourceId: _normalize(el.resourceId ?? el.resourceID ?? el.id ?? ''),
      type: _normalize(el.type ?? el.class ?? ''),
      bounds: _normalizeBounds(el.bounds) ?? [0, 0, 0, 0],
      index
    })}`
  }

export function _summarizeUiChangeDelta(initialElements: UiElement[], currentElements: UiElement[]) {
    const buildMap = (elements: UiElement[]) => {
      const map = new Map<string, string>()
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        if (!element) continue
        const key = _changeIdentityForElement(element, i)
        map.set(key, _hash({
          text: _normalize(element.text ?? element.label ?? element.value ?? ''),
          contentDescription: _normalize(element.contentDescription ?? element.contentDesc ?? element.accessibilityLabel ?? ''),
          resourceId: _normalize(element.resourceId ?? element.resourceID ?? element.id ?? ''),
          type: _normalize(element.type ?? element.class ?? ''),
          bounds: _normalizeBounds(element.bounds) ?? [0, 0, 0, 0],
          state: element.state ?? null,
          visible: !!element.visible,
          enabled: !!element.enabled,
          clickable: !!element.clickable
        }))
      }
      return map
    }

    const initialMap = buildMap(initialElements)
    const currentMap = buildMap(currentElements)
    let added = 0
    let removed = 0
    let mutated = 0

    for (const [key, value] of currentMap.entries()) {
      if (!initialMap.has(key)) {
        added++
      } else if (initialMap.get(key) !== value) {
        mutated++
      }
    }

    for (const key of initialMap.keys()) {
      if (!currentMap.has(key)) removed++
    }

    return {
      total_elements: currentElements.length,
      added_elements: added,
      removed_elements: removed,
      mutated_elements: mutated
    }
  }

export function _buildUiChangeSignatures(tree: Parameters<typeof computeSnapshotSignature>[0]): UiChangeSignatureSet {
    const elements = Array.isArray(tree?.elements) ? tree.elements as UiElement[] : []
    const textPayload: Array<{ text: string, contentDescription: string, resourceId: string }> = []
    const statePayload: Array<{
      checked: boolean | null
      selected: boolean | string | { id: string; label?: string } | null
      focused: boolean | null
      expanded: boolean | null
      enabled: boolean | null
      text_value: string | null
      value: number | string | null
      raw_value: number | string | null
      value_range: UIElementState['value_range']
    }> = []

    for (const el of elements) {
      textPayload.push(textSignature(el))
      statePayload.push(stateSignature(el))
    }

    return {
      hierarchy: computeSnapshotSignature(tree),
      text: _hash({
        screen: _normalize(tree?.screen),
        elements: textPayload
      }),
      state: _hash({
        screen: _normalize(tree?.screen),
        elements: statePayload
      })
    }
  }

export function _matchesUiChange(expected: 'hierarchy_diff' | 'text_change' | 'state_change' | undefined, initial: UiChangeSignatureSet, current: UiChangeSignatureSet): 'hierarchy_diff' | 'text_change' | 'state_change' | null {
    const candidates = expected ? [expected] : _uiChangeKinds

    for (const changeKind of candidates) {
      if (changeKind === 'hierarchy_diff' && initial.hierarchy !== current.hierarchy) return changeKind
      if (changeKind === 'text_change' && initial.text !== current.text) return changeKind
      if (changeKind === 'state_change' && initial.state !== current.state) return changeKind
    }

    return null
  }

export function _uiChangeSignaturesEqual(left: UiChangeSignatureSet, right: UiChangeSignatureSet): boolean {
    return left.hierarchy === right.hierarchy && left.text === right.text && left.state === right.state
  }

function childIndices(elements: UiElement[], element: UiElement, index: number) {
  const directChildren = new Set<number>()
  if (Array.isArray(element.children)) {
    for (const childIndex of element.children) {
      if (typeof childIndex === 'number' && Number.isInteger(childIndex) && childIndex >= 0 && childIndex < elements.length) {
    directChildren.add(childIndex)
      }
    }
  }

  for (let i = 0; i < elements.length; i++) {
    if (_resolveParentIndex(elements, elements[i]?.parentId) === index) {
      directChildren.add(i)
    }
  }


  return directChildren
}

function textSignature(el: UiElement | null) {
  return {
    text: _normalize(el?.text ?? el?.label ?? el?.value ?? ''),
    contentDescription: _normalize(el?.contentDescription ?? el?.contentDesc ?? el?.accessibilityLabel ?? ''),
    resourceId: _normalize(el?.resourceId ?? el?.resourceID ?? el?.id ?? '')
  }
}
function stateSignature(el: UiElement | null) {
  const state = el?.state ?? {}
  return {
    checked: state.checked ?? null,
    selected: state.selected ?? null,
    focused: state.focused ?? null,
    expanded: state.expanded ?? null,
    enabled: state.enabled ?? null,
    text_value: state.text_value ?? null,
    value: state.value ?? null,
    raw_value: state.raw_value ?? null,
    value_range: state.value_range ?? null
  }
}
