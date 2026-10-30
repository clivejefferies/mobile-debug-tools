import { systemClock, type Clock } from '../../runtime/clock.js'
import type { FindElementResponse } from '../../types.js'
import type { RankedResolutionCandidate } from '../model.js'
import type { UiTree, ObserveUI, DeviceTarget } from '../observation.js'
import { _normalize } from './element-helpers.js'
import { checkDebuggerGuard } from '../../debugger/guard.js'
import { scoreCandidate } from './candidate-scoring.js'
import { preferActionable } from './candidate-ancestor.js'
import { candidateResult } from './candidate-result.js'

export interface FindInput extends DeviceTarget { query: string; exact?: boolean; timeoutMs?: number }
interface Search { best: RankedResolutionCandidate | null; tree: UiTree | null; candidates: RankedResolutionCandidate[]; stop: boolean }
function scoreTree(search: Search, tree: UiTree, query: string, exact: boolean) {
  if (!tree || !Array.isArray(tree.elements)) return
  const candidates: RankedResolutionCandidate[] = []
  let improved = false
  for (let i = 0; i < tree.elements.length; i++) {
    try {
      const candidate = scoreCandidate(tree.elements[i], i, query, exact)
      if (!candidate) continue
      candidates.push(candidate)
      if (!search.best || candidate.score > search.best.score) {
        search.best = candidate; search.tree = tree; improved = true
        if (candidate.score >= .95) { search.stop = true; break }
      }
    } catch (error) { checkDebuggerGuard(); console.error('Error scoring element:', error) }
  }
  if (improved) search.candidates = candidates.slice()
}
export async function findElement({ query, exact = false, timeoutMs = 3000, platform, deviceId }: FindInput, observe: ObserveUI, clock: Clock = systemClock): Promise<FindElementResponse> {
  const start = clock.now(), deadline = start + timeoutMs, normalized = _normalize(query)
  if (!normalized) return { found: false, error: 'Empty query' }
  const search: Search = { best: null, tree: null, candidates: [], stop: false }
  while (clock.now() <= deadline) {
    try { scoreTree(search, await observe({ platform, deviceId }), normalized, exact) }
    catch (error) { checkDebuggerGuard(); console.error('Error fetching UI tree:', error) }
    if (search.stop || clock.now() > deadline) break
    await clock.sleep(100)
  }
  if (!search.best) return { found: false, error: 'Element not found' }
  try {
    const elements = search.tree && Array.isArray(search.tree.elements) ? search.tree.elements : []
    const screen = search.tree?.resolution && typeof search.tree.resolution === 'object' ? search.tree.resolution : null
    search.best = preferActionable(search.best, elements, screen)
  } catch (error) { checkDebuggerGuard(); console.error('Error resolving ancestor:', error) }
  return candidateResult(search.best, search.candidates)
}
