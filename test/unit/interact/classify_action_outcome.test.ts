import assert from 'assert'
import { classifyActionOutcome } from '../../../src/interact/classify.js'

function run() {
  // Step 1 — uiChanged → success
  {
    const result = classifyActionOutcome({ uiChanged: true })
    assert.strictEqual(result.outcome, 'success')
    assert.ok(result.reasoning.length > 0)
    assert.strictEqual(result.nextAction, undefined)
  }

  // Step 1 — expectedElementVisible → success
  {
    const result = classifyActionOutcome({ uiChanged: false, expectedElementVisible: true })
    assert.strictEqual(result.outcome, 'success')
    assert.strictEqual(result.reasoning, 'expected element is visible')
    assert.strictEqual(result.nextAction, undefined)
  }

  // Step 1 — both uiChanged and expectedElementVisible → success
  {
    const result = classifyActionOutcome({ uiChanged: true, expectedElementVisible: true })
    assert.strictEqual(result.outcome, 'success')
  }

  // Step 2 — UI did not change, networkRequests not yet provided → nextAction required
  {
    const result = classifyActionOutcome({ uiChanged: false })
    assert.strictEqual(result.outcome, 'unknown')
    assert.strictEqual(result.nextAction, 'call_get_network_activity')
  }

  // Step 2 — explicit null networkRequests → nextAction required
  {
    const result = classifyActionOutcome({ uiChanged: false, expectedElementVisible: null, networkRequests: null })
    assert.strictEqual(result.outcome, 'unknown')
    assert.strictEqual(result.nextAction, 'call_get_network_activity')
  }

  // Step 3 — failure status → backend_failure
  {
    const result = classifyActionOutcome({
      uiChanged: false,
      networkRequests: [{ endpoint: '/login', status: 'failure' }]
    })
    assert.strictEqual(result.outcome, 'backend_failure')
    assert.ok(result.reasoning.includes('/login'))
    assert.ok(result.reasoning.includes('failure'))
  }

  // Step 3 — retryable status → backend_failure
  {
    const result = classifyActionOutcome({
      uiChanged: false,
      networkRequests: [
        { endpoint: '/api/submit', status: 'retryable' },
        { endpoint: '/api/other', status: 'success' }
      ]
    })
    assert.strictEqual(result.outcome, 'backend_failure')
    assert.ok(result.reasoning.includes('/api/submit'))
  }

  // Step 4 — empty network requests → no_op
  {
    const result = classifyActionOutcome({ uiChanged: false, networkRequests: [] })
    assert.strictEqual(result.outcome, 'no_op')
    assert.ok(result.reasoning.includes('no UI change'))
    assert.ok(result.reasoning.includes('no network activity'))
  }

  // Step 4 — empty network requests with log errors → no_op with note
  {
    const result = classifyActionOutcome({ uiChanged: false, networkRequests: [], hasLogErrors: true })
    assert.strictEqual(result.outcome, 'no_op')
    assert.ok(result.reasoning.includes('log errors'))
  }

  // Step 5 — all requests succeeded but UI unchanged → ui_failure
  {
    const result = classifyActionOutcome({
      uiChanged: false,
      networkRequests: [
        { endpoint: '/api/save', status: 'success' },
        { endpoint: '/api/refresh', status: 'success' }
      ]
    })
    assert.strictEqual(result.outcome, 'ui_failure')
    assert.ok(result.reasoning.includes('network requests succeeded'))
  }

  // Step 1 takes priority over network signals — success even when failures present
  {
    const result = classifyActionOutcome({
      uiChanged: true,
      networkRequests: [{ endpoint: '/api/log', status: 'failure' }]
    })
    assert.strictEqual(result.outcome, 'success')
  }

  console.log('classify_action_outcome tests passed')
}

try {
  run()
} catch (error) {
  console.error(error)
  process.exit(1)
}
