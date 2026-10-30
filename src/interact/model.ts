import type { UIElementState, UIElementSemanticMetadata } from '../types.js'
export interface ScreenFingerprintResponse { fingerprint: string | null }

export interface UiElement {
  text?: string | null
  label?: string | null
  value?: string | null
  contentDescription?: string | null
  contentDesc?: string | null
  accessibilityLabel?: string | null
  resourceId?: string | null
  resourceID?: string | null
  id?: string | null
  type?: string | null
  class?: string | null
  bounds?: number[] | null
  clickable?: boolean
  enabled?: boolean
  focusable?: boolean
  visible?: boolean
  parentId?: number | string | null
  children?: number[]
  _index?: number
  _interactable?: boolean
  _sliderLike?: boolean
  state?: UIElementState | null
  stable_id?: string | null
  role?: string | null
  test_tag?: string | null
  selector?: { value: string | null, confidence: { score: number, reason: string } | null } | null
  semantic?: UIElementSemanticMetadata | null
  actions?: string[] | null
  accessibilityActions?: string[] | null
  runtimeActions?: string[] | null
  platformActions?: string[] | null
}

export interface ResolvedUiElementContext {
  elementId: string
  platform: 'android' | 'ios'
  deviceId?: string
  bounds: [number, number, number, number] | null
  index: number
  stable_id?: string | null
}

export interface UiResolution {
  width?: number
  height?: number
}

export interface UiChangeSignatureSet {
  hierarchy: string | null
  text: string | null
  state: string | null
}

export interface UiChangeScopeResolution {
  scope: 'screen' | 'subtree'
  target: string | null
  resolved: boolean
  resolvedIndex: number | null
  resolvedStableId: string | null
  reason: string
}

export interface UiChangeScopeResult {
  elements: UiElement[]
  resolution: UiChangeScopeResolution
  error?: {
    code: 'INVALID_SCOPE' | 'ELEMENT_NOT_FOUND'
    message: string
  }
}

export interface RankedResolutionCandidate {
  el: UiElement
  idx: number
  score: number
  reason: string
  interactable: boolean
}

export interface InferredLabeledSliderState {
  current: number
  min: number
  max: number
  value_range: { min: number; max: number }
  touch_bounds: [number, number, number, number]
  source: 'nearby_labels'
}

export interface FindElementResolutionSummary {
  confidence: number
  reason: string
  fallback_available: boolean
  matched_count: number
  alternates: Array<{
    text: string | null
    resource_id: string | null
    accessibility_id: string | null
    class: string | null
    bounds: { left: number; top: number; right: number; bottom: number } | null
    clickable: boolean
    enabled: boolean
    score: number
    reason: string
  }>
}
