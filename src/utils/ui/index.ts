import crypto from 'crypto'
import { GetUITreeResponse, GetCurrentScreenResponse, UIElement, SwipeResponse } from '../../types.js'

const ANDROID_STRUCTURAL_TYPES = ['Window','Application','View','ViewGroup','LinearLayout','FrameLayout','RelativeLayout','ScrollView','RecyclerView','TextView','ImageView']
const IOS_STRUCTURAL_TYPES = ['Window','Application','View','ViewController','UITableView','UICollectionView','UILabel','UIImageView','UIView','UIWindow','UIStackView','UITextView','UITableViewCell']

function isDynamicText(t?: string): boolean {
  if (!t) return false
  const txt = t.trim()
  if (!txt) return false
  if (/\b\d{1,2}:\d{2}\b/.test(txt)) return true
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(txt)) return true
  if (/^\d+(?:\.\d+)?%$/.test(txt)) return true
  if (/^\d+$/.test(txt)) return true
  if (/^[\d,]{1,10}$/.test(txt)) return true
  return false
}

function normalizeElement(e: UIElement) {
  return {
    type: (e.type || '').toString(),
    resourceId: (e.resourceId || '').toString(),
    text: typeof e.text === 'string' ? (isDynamicText(e.text) ? '' : e.text.trim().toLowerCase()) : '',
    contentDesc: (e.contentDescription || '').toString(),
    bounds: Array.isArray(e.bounds) ? e.bounds.slice(0,4).map((n:any)=>Number(n)||0) : [0,0,0,0]
  }
}

export function computeScreenFingerprint(tree: GetUITreeResponse, current: GetCurrentScreenResponse | null, platform: 'android' | 'ios', limit: number = 50): { fingerprint: string | null; activity?: string; error?: string } {
  try {
    if (!tree || (tree as any).error) return { fingerprint: null, error: (tree as any).error }

    const activity = current && (current.activity || (current as any).shortActivity) ? (current.activity || (current as any).shortActivity) : ''

    const candidates: UIElement[] = (tree.elements || []).filter(e => {
      if (!e) return false
      if (!e.visible) return false
      const hasStableText = typeof e.text === 'string' && e.text.trim().length > 0
      const hasResource = !!e.resourceId
      const interactable = !!e.clickable || !!e.enabled
      const structuralList = platform === 'android' ? ANDROID_STRUCTURAL_TYPES : IOS_STRUCTURAL_TYPES
      const structurallySignificant = hasStableText || hasResource || structuralList.includes(e.type || '')
      return interactable || structurallySignificant
    }) as UIElement[]

    const normalized = candidates.map(normalizeElement)

    const filteredNormalized = normalized.filter(e => (e.text && e.text.length > 0) || (e.resourceId && e.resourceId.length > 0) || (e.contentDesc && e.contentDesc.length > 0))

    filteredNormalized.sort((a,b) => {
      const ay = (a.bounds && a.bounds[1]) || 0
      const by = (b.bounds && b.bounds[1]) || 0
      if (ay !== by) return ay - by
      const ax = (a.bounds && a.bounds[0]) || 0
      const bx = (b.bounds && b.bounds[0]) || 0
      return ax - bx
    })

    const limited = filteredNormalized.slice(0, Math.max(0, limit))

    const payload = {
      activity: platform === 'android' ? (activity || '') : '',
      resolution: (tree as any).resolution || { width: 0, height: 0 },
      elements: limited.map(e => ({ type: e.type, resourceId: e.resourceId, text: e.text, contentDesc: e.contentDesc }))
    }

    const combined = JSON.stringify(payload)
    const hash = crypto.createHash('sha256').update(combined).digest('hex')
    return { fingerprint: hash, activity: activity }
  } catch (e) {
    return { fingerprint: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface ScrollSelector { text?: string; resourceId?: string; contentDesc?: string; className?: string }

export async function scrollToElementShared(opts: {
  selector: ScrollSelector,
  direction?: 'down' | 'up',
  maxScrolls?: number,
  scrollAmount?: number,
  deviceId?: string,
  fetchTree: () => Promise<GetUITreeResponse>,
  swipe: (x1: number, y1: number, x2: number, y2: number, duration: number, deviceId?: string) => Promise<SwipeResponse>,
  stabilizationDelayMs?: number
}): Promise<{ success: boolean; reason?: string; element?: Partial<UIElement>; scrollsPerformed: number }> {
  const { selector, direction = 'down', maxScrolls = 10, scrollAmount = 0.7, deviceId, fetchTree, swipe, stabilizationDelayMs = 350 } = opts

  const matchElement = (el?: UIElement) => {
    if (!el) return false
    if (selector.text !== undefined && selector.text !== el.text) return false
    if (selector.resourceId !== undefined && selector.resourceId !== el.resourceId) return false
    if (selector.contentDesc !== undefined && selector.contentDesc !== el.contentDescription) return false
    if (selector.className !== undefined && selector.className !== el.type) return false
    return true
  }

  const isVisible = (el?: UIElement, resolution?: GetUITreeResponse['resolution']) => {
    if (!el) return false
    if (el.visible === false) return false
    if (!el.bounds || !resolution || !resolution.width || !resolution.height) return (el.visible === undefined ? true : !!el.visible)
    const [left, top, right, bottom] = el.bounds
    const withinY = bottom > 0 && top < resolution.height
    const withinX = right > 0 && left < resolution.width
    return withinX && withinY
  }

  const findVisibleMatch = (elements?: UIElement[], resolution?: GetUITreeResponse['resolution']) => {
    if (!Array.isArray(elements)) return null
    for (const e of elements) {
      if (matchElement(e) && isVisible(e, resolution)) return e
    }
    return null
  }

  // Initial check
  let tree = await fetchTree()
  if (tree.error) return { success: false, reason: tree.error, scrollsPerformed: 0 }

  let found = findVisibleMatch(tree.elements, tree.resolution)
  if (found) {
    return { success: true, element: { text: found.text, resourceId: found.resourceId, bounds: found.bounds }, scrollsPerformed: 0 }
  }

  const fingerprintOf = (t: GetUITreeResponse) => {
    try {
      return JSON.stringify((t.elements || []).map((e: UIElement) => ({ text: e.text, resourceId: e.resourceId, bounds: e.bounds })))
    } catch {
      return ''
    }
  }

  let prevFingerprint = fingerprintOf(tree)

  const width = (tree.resolution && tree.resolution.width) ? tree.resolution.width : 0
  const height = (tree.resolution && tree.resolution.height) ? tree.resolution.height : 0
  const centerX = Math.round(width / 2) || 50

  const clampPct = (v: number) => Math.max(0.05, Math.min(0.95, v))
  const computeCoords = () => {
    const defaultStart = direction === 'down' ? 0.8 : 0.2
    const startPct = clampPct(defaultStart)
    const endPct = clampPct(defaultStart + (direction === 'down' ? -scrollAmount : scrollAmount))
    const x1 = centerX
    const x2 = centerX
    const y1 = Math.round((height || 100) * startPct)
    const y2 = Math.round((height || 100) * endPct)
    return { x1, y1, x2, y2 }
  }

  const duration = 300
  let scrollsPerformed = 0

  for (let i = 0; i < maxScrolls; i++) {
    const { x1, y1, x2, y2 } = computeCoords()
    try {
      await swipe(x1, y1, x2, y2, duration, deviceId)
    } catch (e) {
      try { console.warn(`scrollToElement swipe failed: ${e instanceof Error ? e.message : String(e)}`) } catch {}
    }

    scrollsPerformed++
    await new Promise(resolve => setTimeout(resolve, stabilizationDelayMs))

    tree = await fetchTree()
    if (tree.error) return { success: false, reason: tree.error, scrollsPerformed: scrollsPerformed }

    found = findVisibleMatch(tree.elements, tree.resolution)
    if (found) {
      return { success: true, element: { text: found.text, resourceId: found.resourceId, bounds: found.bounds }, scrollsPerformed }
    }

    const fp = fingerprintOf(tree)
    if (fp === prevFingerprint) {
      return { success: false, reason: 'UI unchanged after scroll; likely end of list', scrollsPerformed: scrollsPerformed }
    }
    prevFingerprint = fp
  }

  return { success: false, reason: 'Element not found after scrolling', scrollsPerformed: scrollsPerformed }
}
