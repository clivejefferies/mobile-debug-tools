import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const targetTools: Tool[] = [
{
    name: 'adjust_control',
    description: `Purpose:
Adjust a numeric control value with verification.

This is the initial adjustable-control surface for slider-like controls and other controls that expose a numeric value or value_range.

Inputs:
- exactly one of selector or element_id
- property (defaults to "value")
- targetValue
- tolerance (optional; discrete default is 0, continuous default is max(step / 2, 1% of range) when omitted)
- maxAttempts (optional; defaults to 5)
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
- source_module: runtime source of the action envelope
- target_state / actual_state / within_tolerance / converged / attempts / adjustment_mode
- target.selector = original selector or element handle
- success = true when the control converges within tolerance

Verification Guidance:
- Prefer direct platform adjustment when the runtime exposes it; then verified increment/decrement actions; use coordinate fallback only as degraded mode
- Use expect_state for the control value readback
- Do not use derived semantic metadata as proof of success

Failure Handling:
- ELEMENT_NOT_FOUND → re-resolve the control
- ELEMENT_NOT_INTERACTABLE → the control cannot be adjusted through the current runtime
- CONTROL_CONVERGENCE_FAILED → the control did not converge within bounded retries or the requested value is out of range
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resource_id: { type: 'string' },
            accessibility_id: { type: 'string' },
            contains: { type: 'boolean', default: false }
          }
        },
        element_id: { type: 'string', description: 'Optional previously resolved element identifier.' },
        property: { type: 'string', description: 'Readable numeric state property to adjust.', default: 'value' },
        targetValue: { type: 'number', description: 'Target numeric value.' },
        tolerance: { type: 'number', description: 'Accepted numeric tolerance around the target value. Defaults are derived from the readable control domain.' },
        maxAttempts: { type: 'number', description: 'Maximum adjustment attempts.', default: 5 },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['targetValue'],
      oneOf: [
        { required: ['selector'] },
        { required: ['element_id'] }
      ]
    }
  },
{
    name: 'find_element',
    description: `Find a UI element by semantic query (text, content-desc, resource-id, class).

Returns the best match plus resolution metadata when available, including confidence, selection reason, and fallback alternates.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (text or label)' },
        exact: { type: 'boolean', description: 'Require exact match (true/false)', default: false },
        timeoutMs: { type: 'number', description: 'Timeout in ms to keep searching', default: 3000 },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['query']
    }
  },
{
    name: 'tap_element',
    description: `Purpose:
Tap a previously resolved UI element using its elementId.

Inputs:
- elementId: a resolved UI element identifier returned by wait_for_ui

Output Structure:
- action_id: unique timestamp-based action identifier
- timestamp: ISO 8601 timestamp for the action attempt
- action_type: "tap_element"
- lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
- source_module: runtime source of the action envelope
- target.selector: original target handle ({ elementId })
- target.resolved: minimal resolved element info used for the tap
- success: true when the tap was dispatched
- failure_code: present when success=false
- retryable: present when failure_code exists
- ui_fingerprint_before/ui_fingerprint_after: optional fingerprints captured around the action

Recommended Usage:
1. Resolve the target with wait_for_ui or another deterministic resolver
2. Call tap_element
3. If needed, wait for transition using wait_for_*
4. Verify outcome using expect_*
   - use expect_screen when navigation is expected
   - use expect_element_visible when the UI change is local
5. If verification fails, inspect failure_code and follow the retry strategy below

Verification Guidance:
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Prefer expect_screen for navigation or modal transitions
- Prefer expect_element_visible when the tap should reveal or update a specific element
- wait_for_* may be used for resolution and synchronization, but not as the final verification step when an applicable expect_* tool exists
- Do not treat tap_element.success as outcome success; it only means the tap was executed

Failure Handling:
- STALE_REFERENCE → re-resolve the element, then retry
- ELEMENT_NOT_INTERACTABLE → wait or refine the target, then retry
- UNKNOWN → capture a snapshot and stop

This tool reports execution success only. Verification must be done with a separate expect_* tool.`,
    inputSchema: {
      type: 'object',
      properties: {
        elementId: {
          type: 'string',
          description: 'A unique element identifier returned by wait_for_ui'
        },
        selector: { type: 'object', properties: { text: { type: 'string' }, resource_id: { type: 'string' }, accessibility_id: { type: 'string' }, contains: { type: 'boolean' } } },
        waitFor: { type: 'object', properties: { condition: { type: 'string', enum: ['exists', 'visible', 'clickable'] }, timeoutMs: { type: 'number', minimum: 100, maximum: 10000 }, pollIntervalMs: { type: 'number', minimum: 50, maximum: 1000 }, match: { type: 'object', properties: { index: { type: 'number' } } } } },
        platform: { type: 'string', enum: ['android', 'ios'] },
        deviceId: { type: 'string' },
        verificationMode: { type: 'string', enum: ['none', 'light', 'full'], default: 'full' },
        responseMode: { type: 'string', enum: ['compact', 'debug'], default: 'debug' }
      }
    }
  }
]
