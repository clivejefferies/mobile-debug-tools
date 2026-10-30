import type {
  CaptureDebugSnapshotRawResponse,
  SnapshotSemanticResponse
} from '../types.js'
export interface SnapshotTreeElementLike {
  text?: string | null
  contentDescription?: string | null
  contentDesc?: string | null
  accessibilityLabel?: string | null
  resourceId?: string | null
  id?: string | null
  type?: string | null
  class?: string | null
  clickable?: boolean
  enabled?: boolean
  visible?: boolean
  state?: unknown
  stable_id?: string | null
  role?: string | null
  test_tag?: string | null
  selector?: unknown
  semantic?: unknown
}

export interface SnapshotTreeLike {
  screen?: string | null
  elements?: SnapshotTreeElementLike[]
}

export function normalizeHint(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase()
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function shortActivityName(activity: string | null | undefined): string | null {
  if (!activity) return null
  const trimmed = String(activity).trim()
  if (!trimmed) return null
  const lastSegment = trimmed.split('.').pop() || trimmed
  const withoutSuffix = lastSegment.replace(/Activity$/, '')
  return withoutSuffix ? titleCase(withoutSuffix) : titleCase(lastSegment)
}

function elementText(element: SnapshotTreeElementLike | undefined) {
  return normalizeHint(element?.text ?? element?.contentDescription ?? element?.contentDesc ?? element?.accessibilityLabel ?? element?.resourceId ?? element?.id ?? '')
}
export function collectSnapshotTexts(tree: SnapshotTreeLike | null | undefined) {
  const elements = Array.isArray(tree?.elements) ? tree!.elements! : []
  const texts: string[] = []
  const actionables: string[] = []

  for (const element of elements) {
    const text = elementText(element)
    if (text) texts.push(text)
    if (element?.clickable && element?.enabled !== false && text) {
      actionables.push(text)
    }
  }

  return {
    texts: Array.from(new Set(texts)),
    actionables: Array.from(new Set(actionables))
  }
}

export function inferSnapshotScreen(raw: CaptureDebugSnapshotRawResponse): string | null {
  const tree = raw.ui_tree as SnapshotTreeLike | null | undefined
  const treeScreen = normalizeHint(tree?.screen)
  if (treeScreen) return titleCase(treeScreen)

  const activity = shortActivityName(raw.activity)
  if (activity) return activity

  const { texts } = collectSnapshotTexts(tree)
  if (texts.length > 0) return titleCase(texts[0])

  return null
}

export function deriveSnapshotSemantic(raw: CaptureDebugSnapshotRawResponse): SnapshotSemanticResponse | null {
  const tree = raw.ui_tree as SnapshotTreeLike | null | undefined
  const { texts, actionables } = collectSnapshotTexts(tree)
  const screenFromTree = normalizeHint(tree?.screen)
  const activityHint = normalizeHint(raw.activity)
  const screen = inferSnapshotScreen(raw)

  if (!screen && !activityHint && texts.length === 0 && !raw.logs.length) return null

  const hasErrorLogs = raw.logs.some((entry) => /error|fatal exception|exception|failed/i.test(entry.message))
  const hasLoadingSignals = texts.some((text) => /loading|please wait|spinner|progress/i.test(text))
  const hasPrimaryText = texts.some((text) => /sign in|log in|login|home|checkout|settings|menu|profile|search/i.test(text))
  const hasScreenshot = typeof raw.screenshot === 'string' && raw.screenshot.length > 0
  const hasUiTree = !!tree && Array.isArray(tree.elements)

  const signals: Record<string, string | number | boolean> = {
    has_activity: !!activityHint,
    has_ui_tree: hasUiTree,
    has_screenshot: hasScreenshot,
    has_visible_text: texts.length > 0,
    has_clickable_elements: actionables.length > 0,
    has_error_logs: hasErrorLogs,
    has_loading_signals: hasLoadingSignals,
    has_primary_text: hasPrimaryText
  }

  const warnings = snapshotWarnings(screenFromTree, activityHint, hasUiTree, hasErrorLogs)
  const confidence = snapshotConfidence(hasUiTree, screen, activityHint, actionables.length, texts.length, hasScreenshot, hasErrorLogs, hasLoadingSignals)

  if (!screen && confidence < 0.3) return null

  return {
    screen,
    signals,
    actions_available: actionables.length > 0 ? actionables.slice(0, 10) : null,
    confidence,
    warnings
  }
}

function snapshotWarnings(screenFromTree: string, activityHint: string, hasUiTree: boolean, hasErrorLogs: boolean) {
  const warnings: string[] = []
  if (screenFromTree && activityHint && screenFromTree !== activityHint) {
    warnings.push('ui_tree.screen and activity hints differ')
  }
  if (!hasUiTree) warnings.push('ui tree unavailable')
  if (!activityHint) warnings.push('activity unavailable')
  if (hasErrorLogs) warnings.push('error signals present in logs')

  return warnings
}

function snapshotConfidence(hasUiTree: boolean, screen: string | null, activityHint: string, actionableCount: number, textCount: number, hasScreenshot: boolean, hasErrorLogs: boolean, hasLoadingSignals: boolean) {
  const evidenceScore =
    (hasUiTree ? 0.35 : 0) +
    (screen ? 0.2 : 0) +
    (activityHint ? 0.15 : 0) +
    (actionableCount > 0 ? 0.15 : 0) +
    (textCount > 0 ? 0.1 : 0) +
    (hasScreenshot ? 0.05 : 0) +
    (hasErrorLogs ? -0.15 : 0) +
    (hasLoadingSignals ? -0.05 : 0)

  const confidence = Math.max(0, Math.min(1, Number(evidenceScore.toFixed(2))))
  return confidence
}
