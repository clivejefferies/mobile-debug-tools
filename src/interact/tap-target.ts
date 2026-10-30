import type { ActionTargetResolved, ActionFailureCode } from '../types.js'
import type { UiElement, ResolvedUiElementContext } from './model.js'
import type { UiTree } from './observation.js'
import { _isTapActionable, _normalizeBounds } from './element-helpers.js'
interface TapResolution {
  current(elements: UiElement[], platform: 'android' | 'ios', deviceId: string | undefined, handle: ResolvedUiElementContext): { el: UiElement; index: number } | null
  target(element: UiElement, index: number): ActionTargetResolved
}
type TapTarget = { failure: ActionFailureCode; target: ActionTargetResolved | null } | { target: ActionTargetResolved; point: { x: number; y: number } }
export function resolveTap(tree: UiTree, stored: ResolvedUiElementContext, deps: TapResolution): TapTarget {
  const platform = tree?.device?.platform === 'ios' ? 'ios' : stored.platform
  const deviceId = tree?.device?.id || stored.deviceId
  const elements = Array.isArray(tree?.elements) ? tree.elements : []
  const current = deps.current(elements, platform, deviceId, stored)
  if (!current) return { failure: 'STALE_REFERENCE', target: null }
  const target = deps.target(current.el, current.index)
  const actionable = _isTapActionable(current.el, stored.stable_id, stored.platform)
  if (!actionable.actionable) return { failure: actionable.failureCode ?? 'ELEMENT_NOT_INTERACTABLE', target }
  const bounds = _normalizeBounds(current.el.bounds) ?? stored.bounds
  if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) return { failure: 'ELEMENT_NOT_INTERACTABLE', target }
  return { target, point: { x: Math.floor((bounds[0] + bounds[2]) / 2), y: Math.floor((bounds[1] + bounds[3]) / 2) } }
}
