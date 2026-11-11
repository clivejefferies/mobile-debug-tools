import { summarize } from './report.js'

export interface Span { stage: string; start_ms: number; end_ms: number }
export interface RequestMetric {
  event: 'latency_metric'; request_id: string; tool: string
  handler_completed: boolean; elapsed_ms: number; spans: Span[]
}
export interface TreeMetric {
  event: 'ui_tree_metric'; type: string; stage?: string; elapsed_ms?: number
  acquisition_id?: string; success?: boolean; durations_ms?: Record<string, number>
}
export interface RequestSample {
  tool: string; elapsed_ms: number; response_bytes?: number; success: boolean
  failure?: string; failed_step?: string; failure_code?: string; metrics: RequestMetric[]; tree: TreeMetric[]
}
export interface Attempt {
  case: string; iteration: number; warmup: boolean; success: boolean
  failure?: string; setup_ms: number; requests: RequestSample[]
}

export function unionDuration(spans: Span[], limit: number) {
  const sorted = spans.map(span => [Math.max(0, span.start_ms), Math.min(limit, span.end_ms)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((a, b) => a[0] - b[0])
  let end = 0, total = 0
  for (const [start, stop] of sorted) { total += Math.max(0, stop - Math.max(end, start)); end = Math.max(end, stop) }
  return total
}

export function summarizeAttempts(attempts: Attempt[]) {
  return Object.fromEntries([...new Set(attempts.map(attempt => attempt.case))].map(name => {
    const selected = attempts.filter(attempt => attempt.case === name)
    const measured = selected.filter(attempt => !attempt.warmup)
    const successful = measured.filter(attempt => attempt.success)
    const requests = successful.flatMap(attempt => attempt.requests)
    const metrics = requests.flatMap(request => request.metrics)
    const tree = requests.flatMap(request => request.tree)
    const stages = [...new Set(metrics.flatMap(metric => metric.spans.map(span => span.stage)))]
    const treeStages = [...new Set(tree.filter(event => event.type === 'stage').map(event => event.stage!))]
    return [name, {
      attempts: measured.length, failures: measured.filter(attempt => !attempt.success).length,
      warmup_failures: selected.filter(attempt => attempt.warmup && !attempt.success).length,
      total_ms: summarize(successful.map(attempt => attempt.requests.reduce((sum, request) => sum + request.elapsed_ms, 0))),
      response_bytes: summarize(successful.map(attempt => attempt.requests.reduce((sum, request) => sum + (request.response_bytes ?? 0), 0))),
      handler_ms: summarize(metrics.map(metric => metric.elapsed_ms)),
      handler_unattributed_ms: summarize(metrics.map(metric => Math.max(0, metric.elapsed_ms - unionDuration(metric.spans, metric.elapsed_ms)))),
      client_minus_handler_ms: summarize(requests.filter(request => request.metrics.length === 1)
        .map(request => request.elapsed_ms - request.metrics[0].elapsed_ms)),
      inclusive_components_ms: Object.fromEntries(stages.map(stage => [stage, summarize(metrics.map(metric =>
        metric.spans.filter(span => span.stage === stage).reduce((sum, span) => sum + span.end_ms - span.start_ms, 0)))])),
      physical_reads: tree.filter(event => event.type === 'physical_read_completed').length,
      failed_physical_reads: tree.filter(event => event.type === 'physical_read_completed' && event.success === false).length,
      tree_stages_ms: Object.fromEntries(treeStages.map(stage => [stage, summarize(tree.filter(event => event.type === 'stage' && event.stage === stage).map(event => event.elapsed_ms ?? 0))])),
      tree_acquisition_ms: summarize(tree
        .filter(event => event.type === 'acquisition_completed').map(event => event.elapsed_ms ?? 0)),
      missing_request_metrics: requests.filter(request => request.metrics.length !== 1).length
    }]
  }))
}

export function observationOverhead(attempts: Attempt[]) {
  return Object.fromEntries(['screenshot', 'tree', 'snapshot'].map(name => {
    const pairs = attempts.filter(attempt => attempt.case === `${name}-on` && !attempt.warmup && attempt.success)
      .flatMap(on => {
        const off = attempts.find(attempt => attempt.case === `${name}-off` && attempt.iteration === on.iteration && !attempt.warmup && attempt.success)
        return off ? [on.requests.reduce((sum, request) => sum + request.elapsed_ms, 0) - off.requests.reduce((sum, request) => sum + request.elapsed_ms, 0)] : []
      })
    return [name, { paired_on_minus_off_ms: summarize(pairs), interpretation: 'Includes device/order variability; not an isolated causal overhead estimate' }]
  }))
}

// Whitelist timing metadata rather than persisting unrestricted server stderr.
export function parseMetric(line: string): RequestMetric | TreeMetric | null {
  try {
    const value = JSON.parse(line)
    const finite = (number: unknown) => typeof number === 'number' && Number.isFinite(number) && number >= 0
    if (value.event === 'latency_metric' && typeof value.tool === 'string' && typeof value.request_id === 'string' &&
      typeof value.handler_completed === 'boolean' && finite(value.elapsed_ms) && Array.isArray(value.spans) &&
      value.spans.every((span: Span) => typeof span.stage === 'string' && finite(span.start_ms) && finite(span.end_ms) && span.end_ms >= span.start_ms)) {
      return { event: value.event, request_id: value.request_id, tool: value.tool,
        handler_completed: value.handler_completed, elapsed_ms: value.elapsed_ms,
        spans: value.spans.map((span: Span) => ({ stage: span.stage, start_ms: span.start_ms, end_ms: span.end_ms })) }
    }
    if (value.event === 'ui_tree_metric' && typeof value.type === 'string' &&
      (value.elapsed_ms === undefined || finite(value.elapsed_ms))) return { event: value.event, type: value.type,
      stage: value.stage, elapsed_ms: value.elapsed_ms, acquisition_id: value.acquisition_id,
      success: value.success, durations_ms: value.durations_ms }
  } catch { /* Non-metric stderr is intentionally discarded. */ }
  return null
}
