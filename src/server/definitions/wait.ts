import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const waitTools: Tool[] = [
{
    name: 'wait_for_screen_change',
    description: `Purpose:
Detect that a screen transition has occurred by waiting for the current fingerprint to differ from a previous fingerprint.

Capabilities:
- Synchronization for uncertain navigation timing
- Detection that something changed on screen

Constraints:
- Does not verify correctness of the resulting state
- Must not be used alone to confirm action success when an applicable expect_* tool exists
- For backend/API activity without a visible UI change, pass the runtime action_type into classify_action_outcome and collect network evidence only if the result remains ambiguous

Recommended Usage:
1. Capture or define the expected outcome
2. Call an action tool
3. Use wait_for_screen_change when transition timing is uncertain
4. Follow with expect_screen when the expected destination is known`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        previousFingerprint: { type: 'string', description: 'The fingerprint to compare against (required)' },
        timeoutMs: { type: 'number', description: 'Timeout in ms to wait for change (default 5000)', default: 5000 },
        pollIntervalMs: { type: 'number', description: 'Polling interval in ms (default 300)', default: 300 },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' }
      },
      required: ['previousFingerprint']
    }
  },
{
    name: 'wait_for_ui_change',
    description: `Purpose:
Wait for a non-navigation UI mutation or in-place update to become stable.

Inputs:
- expected_change (optional): hierarchy_diff, text_change, or state_change
- timeout_ms (optional)
- stability_window_ms (optional)
- scope (optional): screen or subtree
- target (optional): element_id when scope=subtree

Guidance:
- Prefer wait_for_screen_change for navigation transitions.
- Prefer wait_for_ui_change for in-place mutations and non-navigation updates.
- Use the returned snapshot_revision as the observed synchronization point when available.
- Scoped waits return scope-aware stability metadata and a lightweight change summary.

Failure Handling:
- TIMEOUT means the UI did not change in a stable way within the allotted time.`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' },
        expected_change: { type: 'string', enum: ['hierarchy_diff', 'text_change', 'state_change'], description: 'Optional type of UI change to wait for' },
        scope: { type: 'string', enum: ['screen', 'subtree'], default: 'screen', description: 'Synchronization scope for the wait' },
        target: { type: 'string', description: 'Target element_id when scope is subtree' },
        timeout_ms: { type: 'number', description: 'Timeout in ms to wait for change (default 60000)', default: 60000 },
        stability_window_ms: { type: 'number', description: 'How long the change must remain stable before success (default 300)', default: 300 }
      }
    }
  },
{
    name: 'wait_for_ui',
    description: `Purpose:
Resolve elements and/or detect that a UI transition or availability condition has occurred.

Capabilities:
- Deterministic element resolution
- Synchronization when element timing or availability is uncertain

Constraints:
- Does not verify correctness of the resulting state
- Must not be used alone to confirm action success when an applicable expect_* tool exists

Recommended Usage:
1. Use wait_for_ui to resolve an element before acting or to wait for UI readiness
2. Call the action tool
3. If the expected outcome is known, follow with expect_* as final verification`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resource_id: { type: 'string' },
            accessibility_id: { type: 'string' },
            contains: { type: 'boolean', description: 'When true, perform substring matching', default: false }
          }
        },
        condition: { type: 'string', enum: ['exists', 'not_exists', 'visible', 'clickable'], default: 'exists' },
        timeout_ms: { type: 'number', default: 60000 },
        poll_interval_ms: { type: 'number', default: 300 },
        match: { type: 'object', properties: { index: { type: 'number' } } },
        retry: { type: 'object', properties: { max_attempts: { type: 'number', default: 1 }, backoff_ms: { type: 'number', default: 0 } } },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      }
    }
  }
]
