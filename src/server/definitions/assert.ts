import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const assertTools: Tool[] = [
{
    name: 'expect_screen',
    description: `Purpose:
Deterministically verify that the intended navigation outcome of an action has occurred.

Inputs:
- fingerprint: preferred exact-match screen fingerprint
- screen: exact semantic screen identifier when a fingerprint is not available

Output Structure:
- success: true when the expected screen matches the observed screen
- observed_screen: current fingerprint and screen identifier
- expected_screen: the expected fingerprint and/or screen identifier
- confidence: 1 for an exact match, otherwise 0

Recommended Usage:
1. Define the expected screen before executing the action
2. Resolve the target element or screen state
3. Call an action tool such as tap_element
4. If needed, wait for transition using wait_for_*
5. Call expect_screen as the final verification step
6. If success=false, treat the outcome as unverified and follow the action tool retry guidance

Verification Guidance:
- Primary and authoritative verification tool for navigation outcomes
- Prefer fingerprint whenever you have one
- Use screen only as a fallback exact match against known identifiers
- Works best when the expected screen identifier is known ahead of time
- If the expected screen is not already known, capture or define it before executing the action

Constraints:
- Returns structured binary success/failure only
- Must not rely on natural-language interpretation or reasoning

Failure Handling:
- success=false means the expected screen was not reached; retry or recover using the action tool's failure strategy`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        fingerprint: { type: 'string', description: 'Expected screen fingerprint. Preferred verification mechanism.' },
        screen: { type: 'string', description: 'Expected exact screen identifier when no fingerprint is available.' },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' }
      }
    }
  },
{
    name: 'expect_element_visible',
    description: `Purpose:
Deterministically verify that the intended UI outcome of an action has occurred by confirming a target element is visible.

Inputs:
- selector: required selector used to resolve the target element
- element_id: optional previously resolved element identifier used only as context

Output Structure:
- success: true when the element is visible
- selector: selector used for verification
- element_id: resolved element identifier when available
- element: minimal resolved element info when visible
- failure_code: TIMEOUT or UNKNOWN when verification fails
- retryable: true when failure_code=TIMEOUT

Recommended Usage:
1. Define the expected element state before executing the action
2. Resolve the target element or triggering control
3. Call an action tool such as tap_element
4. If needed, wait for UI availability using wait_for_*
5. Call expect_element_visible as the final verification step
6. If success=false, follow the action tool retry guidance

Verification Guidance:
- Primary and authoritative verification tool for expected element appearance or visibility
- Use this when the screen should stay the same but the UI should reveal or update a specific element
- selector is the primary input; element_id is an optional optimization only
- The tool resolves the selector internally when needed

Constraints:
- Returns structured binary success/failure only
- Must not rely on natural-language interpretation or reasoning

Failure Handling:
- TIMEOUT → retry verification once or retry the action after re-resolving
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
        timeout_ms: { type: 'number', default: 5000 },
        poll_interval_ms: { type: 'number', default: 300 },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['selector']
    }
  },
{
    name: 'expect_state',
    description: `Purpose:
Verify a readable UI state property on the currently visible element.

Inputs:
- selector or element_id
- property
- expected
- platform/deviceId (optional)

Supported properties:
- checked, selected, focused, expanded, enabled, text_value, value, raw_value

Verification Guidance:
- Use this when the UI element is visible but its state must also be confirmed
- Prefer the canonical property names above
- The tool compares the normalized readable state and returns the observed value when available

Constraints:
- Returns structured success/failure only
- Does not infer a state when the property is unavailable

Failure Handling:
- ELEMENT_NOT_FOUND → re-resolve the element or wait for UI stabilization
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
        property: { type: 'string', description: 'Readable state property to verify.' },
        expected: {
          description: 'Expected normalized state value.',
          oneOf: [
            { type: 'boolean' },
            { type: 'number' },
            { type: 'string' },
            { type: 'object' }
          ]
        },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['property', 'expected']
    }
  }
]
