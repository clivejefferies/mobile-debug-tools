import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const diagnosticTools: Tool[] = [
{
    name: 'get_system_status',
    description: 'Quick healthcheck of local mobile debugging environment (adb, devices, logs, env, iOS).',
    inputSchema: { type: 'object', properties: {} }
  },
{
    name: 'classify_action_outcome',
    description: `Classify the outcome of the most recent action into exactly one of: success, no_op, backend_failure, ui_failure, unknown.

Use the runtime action result's \`action_type\` as \`actionType\` so the classifier can distinguish local-state actions from side-effect actions.
Use this when the intended outcome is not already fully verified by the UI signal alone.
For backend/API activity, compare get_screen_fingerprint before and after the action and call get_network_activity immediately after the action if the outcome is still ambiguous.

HOW TO GATHER INPUTS before calling:
1. Call wait_for_screen_change or compare get_screen_fingerprint before/after — set uiChanged accordingly.
2. If you checked for a specific element with wait_for_ui, set expectedElementVisible.
3. Pass actionType from the action response when available.
4. Only provide networkRequests if you already collected them or want to classify a side-effect action with backend evidence.

RULES (applied in order — stop at first match):
1. If uiChanged=true OR expectedElementVisible=true → outcome=success
2. If actionType is missing → outcome=unknown
3. If any request has status=failure or retryable → outcome=backend_failure
4. If actionType maps to a local-state action → outcome=no_op; prefer state-based verification and avoid default network fallback
5. If actionType maps to a side-effect action and no networkRequests were supplied → outcome=unknown
6. If no requests returned → outcome=no_op
7. If all requests succeeded → outcome=ui_failure
8. Otherwise → outcome=unknown

BEHAVIOUR after outcome:
- success → continue
- no_op → retry with richer state verification or re-resolve the element
- backend_failure → stop and report the failing endpoint
- ui_failure → stop and report failure
- unknown → take one recovery step (e.g. capture_debug_snapshot), then stop`,
    inputSchema: {
      type: 'object',
      properties: {
        uiChanged: {
          type: 'boolean',
          description: 'true if the screen fingerprint or activity changed after the action. Use wait_for_screen_change or compare get_screen_fingerprint before and after.'
        },
        expectedElementVisible: {
          type: 'boolean',
          description: 'true if the element you expected to appear is now visible (from wait_for_ui). Omit if you did not check for a specific element.'
        },
        actionType: {
          type: 'string',
          description: 'The runtime action_type from the action response (for example tap, tap_element, swipe, type_text, press_back, start_app).'
        },
        networkRequests: {
          type: 'array',
          description: 'Optional network evidence collected after the action. Use it when the expected outcome is backend/API activity or when the UI signal is ambiguous.',
          items: {
            type: 'object',
            properties: {
              endpoint: { type: 'string', description: 'Request endpoint or full URL' },
              status: { type: 'string', enum: ['success', 'failure', 'retryable'], description: 'Outcome of the request' }
            },
            required: ['endpoint', 'status']
          }
        },
        hasLogErrors: {
          type: 'boolean',
          description: 'true if structured log errors were observed (e.g. from read_log_stream). Optional — include if you have already read logs.'
        }
      },
      required: ['uiChanged']
    }
  },
{
    name: 'run_journey',
    description: 'Run an ordered, bounded sequence of start_app, tap, wait, and deterministic assertion steps against one device. Stops after the first failed step.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'] },
        deviceId: { type: 'string' },
        responseMode: { type: 'string', enum: ['compact', 'debug'], default: 'compact' },
        steps: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string', enum: ['start_app', 'tap', 'wait', 'assert'] } }, required: ['id', 'type'] } }
      },
      required: ['platform', 'steps']
    }
  },
{
    name: 'get_network_activity',
    description: `Returns structured network events captured from platform logs since the last action.

Call this immediately after an action when you want backend evidence for a side-effect flow, only if the result is still ambiguous.
Do not call more than once per action.

Events are filtered to significant (non-background) requests only.
Each event includes endpoint, method, statusCode, networkError, status, and durationMs.

status values:
- success: HTTP 2xx or request detected with no error signal
- failure: HTTP 4xx
- retryable: HTTP 5xx, network error (timeout, dns_error, tls_error, etc.)

Returns { requests: [], count: 0 } when no credible network signals are found.`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to read network logs from'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial (Android) or UDID (iOS). Defaults to connected/booted device.'
        }
      },
      required: ['platform']
    }
  }
]
