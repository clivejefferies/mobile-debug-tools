export interface AndroidXMLNode {
  [key: string]: unknown
  '@_class'?: string; '@_text'?: string; '@_content-desc'?: string; '@_resource-id'?: string; '@_bounds'?: string
  '@_clickable'?: string | boolean; '@_enabled'?: string | boolean; '@_visible-to-user'?: string | boolean
  node?: AndroidXMLNode | AndroidXMLNode[]
}
import { UIElement, UIElementSemanticMetadata, UIElementState, UIResolutionSelector, SelectorConfidence } from "../../types.js"
export function parseBounds(bounds: string): [number, number, number, number] {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  }
  return [0, 0, 0, 0];
}

export function getCenter(bounds: [number, number, number, number]): [number, number] {
  const [x1, y1, x2, y2] = bounds;
  return [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)];
}

export function parseBooleanAttr(value: unknown): boolean | null {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return null
}

export function parseNumberAttr(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeClassName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function inferAndroidRole(className: string): string | null {
  if (/seekbar|slider/.test(className)) return 'slider'
  if (/stepper|numberpicker/.test(className)) return 'stepper'
  if (/spinner|dropdown/.test(className)) return 'dropdown'
  if (/segment|tablayout/.test(className)) return 'segmented_control'
  if (/switch|toggle/.test(className)) return 'switch'
  if (/checkbox/.test(className)) return 'checkbox'
  if (/radiobutton|radio/.test(className)) return 'radio'
  if (/edittext|textfield|search/.test(className)) return 'text_field'
  if (/button|fab/.test(className)) return 'button'
  if (/imageview|icon/.test(className)) return 'image'
  if (/recyclerview|scroll|layout|viewgroup|frame/.test(className)) return 'container'
  return null
}

export function buildAndroidSelectorConfidence(source: 'resource_id' | 'content_desc' | 'text' | 'class' | 'none'): SelectorConfidence | null {
  switch (source) {
    case 'resource_id':
      return { score: 1, reason: 'resource_id' }
    case 'content_desc':
      return { score: 0.9, reason: 'content_description' }
    case 'text':
      return { score: 0.6, reason: 'text_match' }
    case 'class':
      return { score: 0.35, reason: 'class_match' }
    default:
      return null
  }
}

export function buildAndroidSelector(text: string | null, contentDescription: string | null, resourceId: string | null, className: string): UIResolutionSelector | null {
  if (resourceId) return { value: resourceId, confidence: buildAndroidSelectorConfidence('resource_id') }
  if (contentDescription) return { value: contentDescription, confidence: buildAndroidSelectorConfidence('content_desc') }
  if (text) return { value: text, confidence: buildAndroidSelectorConfidence('text') }
  if (className) return { value: className, confidence: buildAndroidSelectorConfidence('class') }
  return null
}

export function buildAndroidSemantic(clickable: boolean, className: string, role: string | null): UIElementSemanticMetadata {
  const semantic: UIElementSemanticMetadata = {
    is_clickable: clickable,
    is_container: /recyclerview|scroll|layout|viewgroup|frame/.test(className)
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
  } else if (clickable) {
    semantic.supported_actions = ['tap']
  }

  return semantic
}

export function isSliderLikeAndroid(node: AndroidXMLNode): boolean {
  const className = String(node['@_class'] || '').toLowerCase()
  return /seekbar|slider|range/i.test(className)
}

export function extractAndroidState(node: AndroidXMLNode): UIElementState | null {
  const checked = parseBooleanAttr(node['@_checked'])
  const selectedFlag = parseBooleanAttr(node['@_selected'])
  const focused = parseBooleanAttr(node['@_focused'])
  const expanded = parseBooleanAttr(node['@_expanded'])
  const enabled = parseBooleanAttr(node['@_enabled'])
  const textValue = typeof node['@_text'] === 'string' && node['@_text'].trim().length > 0 ? node['@_text'] : null
  const state: UIElementState = {}

  if (checked !== null) state.checked = checked
  if (selectedFlag !== null) {
    state.selected = textValue || node['@_content-desc'] || true
  }
  if (focused !== null) state.focused = focused
  if (expanded !== null) state.expanded = expanded
  if (enabled !== null) state.enabled = enabled

  if (textValue && /edittext|textfield|search/i.test(String(node['@_class'] || ''))) {
    state.text_value = textValue
  }

  addNumericState(node, state, textValue)

  return Object.keys(state).length > 0 ? state : null
}

export function traverseNode(node: AndroidXMLNode, elements: UIElement[], parentIndex: number = -1, depth: number = 0): number {
  if (!node) return -1;

  let currentIndex = -1;

  if (node['@_class']) {
    const { text, contentDescription, clickable, className, bounds, state, role, resourceId, stableId, testTag, selector, semantic, isUseful } = describeNode(node)

    if (isUseful) {
      const element: UIElement = {
        text,
        contentDescription,
        type: className,
        resourceId,
        clickable,
        enabled: node['@_enabled'] === 'true',
        visible: true,
        bounds,
        center: getCenter(bounds),
        depth,
        state,
        stable_id: stableId,
        role,
        test_tag: testTag,
        selector,
        semantic
      };

      if (parentIndex !== -1) {
        element.parentId = parentIndex;
      }

      elements.push(element);
      currentIndex = elements.length - 1;
    }
  }

  const nextParentIndex = currentIndex !== -1 ? currentIndex : parentIndex;
  const nextDepth = currentIndex !== -1 ? depth + 1 : depth;

  const childrenIndices: number[] = [];

  if (node.node) {
    if (Array.isArray(node.node)) {
      node.node.forEach((child: AndroidXMLNode) => {
        const childIndex = traverseNode(child, elements, nextParentIndex, nextDepth);
        if (childIndex !== -1) childrenIndices.push(childIndex);
      });
    } else {
      const childIndex = traverseNode(node.node, elements, nextParentIndex, nextDepth);
      if (childIndex !== -1) childrenIndices.push(childIndex);
    }
  }

  if (currentIndex !== -1 && childrenIndices.length > 0) {
    elements[currentIndex].children = childrenIndices;
  }

  return currentIndex;
}

function addNumericState(node: AndroidXMLNode, state: UIElementState, textValue: string | null) {
  if (isSliderLikeAndroid(node)) {
    const rawProgress = parseNumberAttr(node['@_progress'])
    const max = parseNumberAttr(node['@_max'])
    const fallbackValue = rawProgress ?? parseNumberAttr(node['@_value']) ?? parseNumberAttr(node['@_content-desc'])
    const numericValue = rawProgress ?? fallbackValue
    if (numericValue !== null) {
      state.raw_value = numericValue
      state.value_range = max !== null && max > 0 ? { min: 0, max } : null
      state.value = max !== null && max > 0 ? Math.round((numericValue / max) * 100) : numericValue
    }
  } else {
    const numericValue = parseNumberAttr(node['@_value'])
    if (numericValue !== null) {
      state.value = numericValue
      state.raw_value = numericValue
    } else if (textValue) {
      state.value = textValue
    }
  }

}

function describeNode(node: AndroidXMLNode) {
  const text = node['@_text'] || null;
  const contentDescription = node['@_content-desc'] || null;
  const clickable = node['@_clickable'] === 'true';
  const className = String(node['@_class'] || 'unknown');
  const bounds = parseBounds(node['@_bounds'] || '[0,0][0,0]');
  const state = extractAndroidState(node);
  const role = inferAndroidRole(normalizeClassName(className));
  const resourceId = typeof node['@_resource-id'] === 'string' && node['@_resource-id'].trim().length > 0 ? node['@_resource-id'] : null
  const stableId = resourceId ?? (typeof contentDescription === 'string' && contentDescription.trim().length > 0 ? contentDescription : null)
  const testTag = stableId
  const selector = buildAndroidSelector(text, contentDescription, resourceId, normalizeClassName(className))
  const semantic = buildAndroidSemantic(clickable, normalizeClassName(className), role)

  const isUseful = clickable || (text && text.length > 0) || (contentDescription && contentDescription.length > 0);

  return { text, contentDescription, clickable, className, bounds, state, role, resourceId, stableId, testTag, selector, semantic, isUseful }
}
