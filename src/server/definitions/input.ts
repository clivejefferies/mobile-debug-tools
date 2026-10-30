import { verificationModeJson, responseModeJson } from '../../contracts/execution-controls.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const inputTools: Tool[] = [
{
    name: 'tap',
    description: `Purpose:
Dispatch a tap at specific screen coordinates.

Inputs:
- x, y coordinates
- platform (optional)
- deviceId (optional)

Output Structure:
 - action_id, timestamp (ISO 8601), action_type
 - lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
 - source_module: runtime source of the action envelope
 - target.selector = { x, y }
- success = true when the tap was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Resolve coordinates deterministically
2. Call tap
3. If needed, wait for transition using wait_for_*
4. Verify with expect_screen or expect_element_visible depending on the intended outcome

Verification Guidance:
- Prefer tap_element over tap when an element can be resolved
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Use expect_screen for navigation and expect_element_visible for local UI changes
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to tap on'
        },
        x: {
          type: 'number',
          description: 'X coordinate'
        },
        y: {
          type: 'number',
          description: 'Y coordinate'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        },
        verificationMode: { ...verificationModeJson, default: 'full' },
        responseMode: { ...responseModeJson, default: 'debug' },
        actionTimeoutMs: { type: 'number', minimum: 100, maximum: 30000 },
        verificationTimeoutMs: { type: 'number', minimum: 100, maximum: 60000 }
      },
      required: ['x', 'y']
    }
  },
{
    name: 'swipe',
    description: `Purpose:
Dispatch a swipe gesture on Android or iOS.

Inputs:
- start and end coordinates
- duration
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
- source_module: runtime source of the action envelope
- target.selector = { x1, y1, x2, y2, duration }
- success = true when the swipe was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Determine swipe coordinates
2. Call swipe
3. If needed, wait for transition using wait_for_*
4. Verify with expect_screen or expect_element_visible when a deterministic outcome is expected

Verification Guidance:
- Swipe outcomes are less predictable; choose the most specific verifier available for the intended effect
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to swipe on (android or ios)'
        },
        x1: { type: 'number', description: 'Start X coordinate' },
        y1: { type: 'number', description: 'Start Y coordinate' },
        x2: { type: 'number', description: 'End X coordinate' },
        y2: { type: 'number', description: 'End Y coordinate' },
        duration: { type: 'number', description: 'Duration in ms' },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      },
      required: ['x1', 'y1', 'x2', 'y2', 'duration']
    }
  },
{
    name: 'scroll_to_element',
    description: `Purpose:
Scroll until a target element becomes visible.

Inputs:
- platform
- selector
- direction, maxScrolls, scrollAmount, deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
- source_module: runtime source of the action envelope
- target.selector = original selector
- target.resolved = minimal resolved element info when found
- success = true when scrolling produced a visible target element
- failure_code/retryable when the target was not reached
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Resolve the target selector
2. Call scroll_to_element
3. If needed, wait for UI stabilization using wait_for_*
4. Verify with expect_element_visible when the expected element visibility is known
5. If success=false, follow failure handling before retrying

Verification Guidance:
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Use expect_element_visible when you need an explicit post-scroll confirmation
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- NAVIGATION_NO_CHANGE → adjust scroll direction or stop
- TIMEOUT → retry with refined selector or larger scroll budget
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Platform to operate on (required)' },
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resourceId: { type: 'string' },
            contentDesc: { type: 'string' },
            className: { type: 'string' }
          }
        },
        direction: { type: 'string', enum: ['down', 'up'], default: 'down' },
        maxScrolls: { type: 'number', default: 10 },
        scrollAmount: { type: 'number', default: 0.7 },
        deviceId: { type: 'string', description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.' }
      },
      required: ['platform', 'selector']
    }
  },
{
    name: 'type_text',
    description: `Purpose:
Type text into the currently focused Android input field.

Inputs:
- text
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
- source_module: runtime source of the action envelope
- target.selector = { text }
- success = true when text input was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Resolve or focus the target input first
2. Call type_text
3. If needed, wait for UI stabilization using wait_for_*
4. Verify with expect_element_visible or expect_screen, depending on the intended outcome

Verification Guidance:
- Prefer verifying the next expected element or screen state instead of inferring success from the text action alone
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → re-focus the input or capture a snapshot`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android'],
          description: 'Platform to type on (currently only android supported)'
        },
        text: {
          type: 'string',
          description: 'The text to type'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      },
      required: ['text']
    }
  },
{
    name: 'press_back',
    description: `Purpose:
Dispatch the Android Back action.

Inputs:
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
- source_module: runtime source of the action envelope
- target.selector = { key: "back" }
- success = true when the back action was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Call press_back
2. If needed, wait for transition using wait_for_*
3. Verify with expect_screen when a known destination is expected
4. If verification fails, retry once or recover explicitly

Verification Guidance:
- Back outcomes can vary by screen, so verify against the intended destination when possible
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android'],
          description: 'Platform (currently only android supported)'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      }
    }
  }
]
