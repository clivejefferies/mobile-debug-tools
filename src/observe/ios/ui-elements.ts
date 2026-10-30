import { UIElement, UIElementSemanticMetadata, UIElementState, UIResolutionSelector, SelectorConfidence } from "../../types.js"
export interface IDBElement {
  AXFrame?: { x: number | string, y: number | string, width: number | string, height: number | string, w?: number | string, h?: number | string };
  frame?: { x: number | string, y: number | string, width: number | string, height: number | string, w?: number | string, h?: number | string };
  AXIdentifier?: string;
  accessibilityIdentifier?: string;
  identifier?: string;
  AXUniqueId?: string;
  AXLabel?: string;
  AXValue?: string;
  AXTraits?: string[];
  AXElementType?: string;
  type?: string;
  label?: string;
  children?: IDBElement[];
}

export function parseIDBFrame(frame: string | Partial<NonNullable<IDBElement['frame']>> | null | undefined): [number, number, number, number] {
  if (!frame) return [0, 0, 0, 0];
  if (typeof frame === 'string') {
    const nums = frame.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return [0, 0, 0, 0];
    const x = Number(nums[0]);
    const y = Number(nums[1]);
    const w = Number(nums[2]);
    const h = Number(nums[3]);
    return [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)];
  }

  const x = Number(frame.x || 0);
  const y = Number(frame.y || 0);
  const w = Number(frame.width || frame.w || 0);
  const h = Number(frame.height || frame.h || 0);
  return [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)];
}

export function getCenter(bounds: [number, number, number, number]): [number, number] {
  const [x1, y1, x2, y2] = bounds;
  return [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)];
}

export function parseIOSNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeIOSType(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function inferIOSRole(type: string, traits: string[]): string | null {
  if (/slider|adjustable/.test(type) || traits.some((trait) => /adjustable|slider/.test(trait))) return 'slider'
  if (/stepper/.test(type)) return 'stepper'
  if (/picker|pop up button|dropdown/.test(type)) return 'dropdown'
  if (/segmented control/.test(type)) return 'segmented_control'
  if (/button/.test(type) || traits.some((trait) => /button/.test(trait))) return 'button'
  if (/cell/.test(type)) return 'cell'
  if (/switch/.test(type)) return 'switch'
  if (/text field|textfield|search field/.test(type)) return 'text_field'
  if (/image/.test(type)) return 'image'
  if (/window|application|group|scroll view|collection view/.test(type)) return 'container'
  return null
}

export function getIOSStableId(node: IDBElement): string | null {
  const candidates = [node.AXIdentifier, node.accessibilityIdentifier, node.identifier, node.AXUniqueId]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  return null
}

export function buildIOSSelectorConfidence(source: 'identifier' | 'label' | 'value' | 'type' | 'none'): SelectorConfidence | null {
  switch (source) {
    case 'identifier':
      return { score: 1, reason: 'accessibility_identifier' }
    case 'label':
      return { score: 0.9, reason: 'label_match' }
    case 'value':
      return { score: 0.75, reason: 'value_match' }
    case 'type':
      return { score: 0.35, reason: 'type_match' }
    default:
      return null
  }
}

export function buildIOSSelector(type: string, label: string | null, value: string | null, stableId: string | null): UIResolutionSelector | null {
  if (stableId) return { value: stableId, confidence: buildIOSSelectorConfidence('identifier') }
  if (label) return { value: label, confidence: buildIOSSelectorConfidence('label') }
  if (value) return { value: value, confidence: buildIOSSelectorConfidence('value') }
  if (type) return { value: type, confidence: buildIOSSelectorConfidence('type') }
  return null
}

export function buildIOSSemantic(type: string, traits: string[], role: string | null, value: string | null): UIElementSemanticMetadata {
  const semantic: UIElementSemanticMetadata = {
    is_clickable: traits.includes("UIAccessibilityTraitButton") || /adjustable|slider/.test(type) || type === "Button" || type === "Cell",
    is_container: /window|application|group|scroll view|collection view/.test(type)
  }

  if (role === 'slider') {
    semantic.semantic_role = 'slider'
    semantic.adjustable = true
    semantic.supported_actions = ['adjust']
    semantic.state_shape = 'continuous'
  } else if (role === 'stepper') {
    semantic.semantic_role = 'stepper'
    semantic.adjustable = true
    semantic.supported_actions = ['increment', 'decrement']
    semantic.state_shape = 'discrete'
  } else if (role === 'dropdown') {
    semantic.semantic_role = 'dropdown'
    semantic.supported_actions = ['tap', 'expand']
    semantic.state_shape = 'semantic'
  } else if (role === 'segmented_control') {
    semantic.semantic_role = 'segmented_control'
    semantic.supported_actions = ['tap']
    semantic.state_shape = 'discrete'
  } else if (traits.some((trait) => /adjustable|slider/i.test(trait)) || /adjustable|slider/.test(type)) {
    semantic.semantic_role = 'custom_adjustable'
    semantic.adjustable = true
    semantic.supported_actions = ['adjust']
    semantic.state_shape = 'continuous'
  } else if (semantic.is_clickable) {
    semantic.supported_actions = ['tap']
  }

  if (semantic.state_shape === undefined && semantic.adjustable && value !== null) {
    const numericValue = parseIOSNumber(value)
    if (numericValue !== null && numericValue >= 0 && numericValue <= 1) {
      semantic.state_shape = 'continuous'
    }
  }

  return semantic
}

export function isIOSAdjustable(node: IDBElement, type: string, traits: string[]): boolean {
  return /slider|adjustable|stepper/i.test(type) || traits.some((trait) => /adjustable|slider/i.test(trait))
}

export function extractIOSState(node: IDBElement, type: string, label: string | null, value: string | null, traits: string[]): UIElementState | null {
  const state: UIElementState = {}
  const normalizedTraits = traits.map((trait) => String(trait).toLowerCase())

  if (normalizedTraits.some((trait) => /selected/.test(trait))) {
    state.selected = label || value || true
  }

  if (normalizedTraits.some((trait) => /focused/.test(trait))) {
    state.focused = true
  }

  if (normalizedTraits.some((trait) => /enabled/.test(trait))) {
    state.enabled = true
  }

  if (normalizedTraits.some((trait) => /disabled/.test(trait))) {
    state.enabled = false
  }

  if (value && /textfield|search|text/i.test(type)) {
    state.text_value = value
  }

  if (isIOSAdjustable(node, type, traits)) {
    const rawValue = parseIOSNumber(value)
    if (rawValue !== null) {
      state.raw_value = rawValue
      state.value = rawValue >= 0 && rawValue <= 1 ? Math.round(rawValue * 100) : rawValue
    } else if (value) {
      state.raw_value = value
      state.value = value
    }
  } else if (value) {
    const numericValue = parseIOSNumber(value)
    if (numericValue !== null) {
      state.value = numericValue
      state.raw_value = numericValue
    } else {
      state.value = value
    }
  }

  return Object.keys(state).length > 0 ? state : null
}

export function traverseIDBNode(node: IDBElement, elements: UIElement[], parentIndex: number = -1, depth: number = 0): number {
  if (!node) return -1;

  let currentIndex = -1;

  const { type, label, value, frame, state, stableId, selector, role, semantic, clickable, isUseful } = describeIDBNode(node)

  if (isUseful) {
    const bounds = parseIDBFrame(frame);
    const element: UIElement = {
      text: label,
      contentDescription: value,
      type: type,
      resourceId: stableId,
      clickable: clickable,
      enabled: true,
      visible: true,
      bounds: bounds,
      center: getCenter(bounds),
      depth: depth,
      state,
      stable_id: stableId,
      role,
      test_tag: stableId,
      selector,
      semantic
    };

    if (parentIndex !== -1) {
      element.parentId = parentIndex;
    }

    elements.push(element);
    currentIndex = elements.length - 1;
  }

  const nextParentIndex = currentIndex !== -1 ? currentIndex : parentIndex;
  const nextDepth = currentIndex !== -1 ? depth + 1 : depth;

  const childrenIndices: number[] = [];

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      const childIndex = traverseIDBNode(child, elements, nextParentIndex, nextDepth);
      if (childIndex !== -1) {
        childrenIndices.push(childIndex);
      }
    }
  }

  if (currentIndex !== -1 && childrenIndices.length > 0) {
    elements[currentIndex].children = childrenIndices;
  }

  return currentIndex;
}

function describeIDBNode(node: IDBElement) {
  const type = node.AXElementType || node.type || "unknown";
  const label = node.AXLabel || node.label || null;
  const value = node.AXValue || null;
  const frame = node.AXFrame || node.frame;
  const traits = node.AXTraits || [];
  const state = extractIOSState(node, type, label, value, traits);
  const normalizedType = normalizeIOSType(type)
  const stableId = getIOSStableId(node)
  const selector = buildIOSSelector(type, label, value, stableId)
  const role = inferIOSRole(normalizedType, traits)
  const semantic = buildIOSSemantic(normalizedType, traits, role, value)

  const clickable = traits.includes("UIAccessibilityTraitButton") || type === "Button" || type === "Cell";

  const isUseful = clickable || (label && label.length > 0) || (value && value.length > 0) || type === "Application" || type === "Window";

  return { type, label, value, frame, state, stableId, selector, role, semantic, clickable, isUseful }
}
