export type ActionOutcome = 'success' | 'no_op' | 'backend_failure' | 'ui_failure' | 'unknown'
export type NetworkRequestStatus = 'success' | 'failure' | 'retryable'

export interface NetworkRequest {
  endpoint: string
  status: NetworkRequestStatus
}

export interface ClassifyActionOutcomeInput {
  uiChanged: boolean
  expectedElementVisible?: boolean | null
  /** null = get_network_activity has not been called yet */
  networkRequests?: NetworkRequest[] | null
  hasLogErrors?: boolean | null
}

export interface ClassifyActionOutcomeResult {
  outcome: ActionOutcome
  reasoning: string
  /** Present when the caller must call get_network_activity before a final classification is possible */
  nextAction?: 'call_get_network_activity'
}

/**
 * Pure deterministic classifier. Applies rules in fixed order.
 * Same inputs always produce the same output.
 */
export function classifyActionOutcome(input: ClassifyActionOutcomeInput): ClassifyActionOutcomeResult {
  const { uiChanged, expectedElementVisible, networkRequests, hasLogErrors } = input

  // Step 1 — UI signal is positive
  if (uiChanged || expectedElementVisible === true) {
    return { outcome: 'success', reasoning: expectedElementVisible === true ? 'expected element is visible' : 'UI changed after action' }
  }

  // Step 2 — UI did not change; network signal is required
  if (networkRequests === null || networkRequests === undefined) {
    return {
      outcome: 'unknown',
      reasoning: 'UI did not change; get_network_activity must be called before classification can proceed',
      nextAction: 'call_get_network_activity'
    }
  }

  // Step 3 — any network failure
  const failedRequest = networkRequests.find((r) => r.status === 'failure' || r.status === 'retryable')
  if (failedRequest) {
    return { outcome: 'backend_failure', reasoning: `network request ${failedRequest.endpoint} returned ${failedRequest.status}` }
  }

  // Step 4 — no network requests at all
  if (networkRequests.length === 0) {
    const logNote = hasLogErrors ? ' (log errors present)' : ''
    return { outcome: 'no_op', reasoning: `no UI change and no network activity${logNote}` }
  }

  // Step 5 — network requests exist and all succeeded
  if (networkRequests.every((r) => r.status === 'success')) {
    return { outcome: 'ui_failure', reasoning: 'network requests succeeded but UI did not change' }
  }

  // Step 6 — fallback
  return { outcome: 'unknown', reasoning: 'signals are inconclusive' }
}
