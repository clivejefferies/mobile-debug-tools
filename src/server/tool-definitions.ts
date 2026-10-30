import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { manageTools } from './definitions/manage.js'
import { observeTools } from './definitions/observe.js'
import { diagnosticTools } from './definitions/diagnostic.js'
import { waitTools } from './definitions/wait.js'
import { assertTools } from './definitions/assert.js'
import { targetTools } from './definitions/target.js'
import { inputTools } from './definitions/input.js'
import { debuggerTools } from './debugger-schema.js'
import { systemTraceTools } from './system-trace-schema.js'
import { journeyStepsJson } from './journey-schema.js'
import { conditionalTools, expectedStateJson } from './condition-schema.js'
import { readinessPropertiesJson } from './readiness-schema.js'

const baseTools = new Map([...manageTools, ...observeTools, ...diagnosticTools, ...waitTools, ...assertTools, ...targetTools, ...inputTools].map(tool => [tool.name, tool]))
const baseOrder = [
  "start_app",
  "terminate_app",
  "restart_app",
  "reset_app_data",
  "install_app",
  "build_app",
  "get_logs",
  "list_devices",
  "get_system_status",
  "capture_screenshot",
  "capture_debug_snapshot",
  "start_log_stream",
  "read_log_stream",
  "stop_log_stream",
  "get_ui_tree",
  "get_current_screen",
  "get_screen_fingerprint",
  "wait_for_screen_change",
  "wait_for_ui_change",
  "expect_screen",
  "expect_element_visible",
  "expect_state",
  "adjust_control",
  "wait_for_ui",
  "find_element",
  "tap",
  "tap_element",
  "swipe",
  "scroll_to_element",
  "type_text",
  "press_back",
  "classify_action_outcome",
  "run_journey",
  "get_network_activity"
]
export const toolDefinitions: Tool[] = [
...debuggerTools,
...systemTraceTools,
...['get_app_readiness', 'wait_for_app_ready'].map(name => ({
    name,
    description: `${name === 'get_app_readiness' ? 'Observe readiness with at most two fresh UI-tree samples.' : 'Wait within a single bounded budget for settled UI evidence.'} Reports loading, transitioning, settled or unknown with evidence and limitations. Managed Android debugger pauses are reported from debugger evidence; unresponsive detection remains unsupported. Settled normalized foreground UI is not proof of app identity, responsiveness or backend completion.`,
    inputSchema: { type: 'object' as const, additionalProperties: false, required: ['platform'], properties: {
      ...readinessPropertiesJson,
      timeoutMs: { ...readinessPropertiesJson.timeoutMs, default: name === 'get_app_readiness' ? 15000 : 30000 },
      ...(name === 'wait_for_app_ready' ? { pollIntervalMs: { type: 'integer', minimum: 100, maximum: 1000, default: 500 } } : {})
    } }
  })),
...baseOrder.map(name => baseTools.get(name)!)
]

// Keep the additive execution controls consistent across all action tools.
for (const tool of toolDefinitions) {
  tool.inputSchema.properties ??= {}
  if (['wait_for_ui', 'wait_for_ui_change'].includes(tool.name)) {
    tool.inputSchema.properties.requireReady = { type: 'boolean', default: false }
    tool.description += '\nSet requireReady=true to require both the existing predicate and settled UI readiness, using the same fresh samples and one timeout budget. The readiness summary explains uncertainty. Default predicate semantics are unchanged.'
  }
  if (tool.name === 'get_ui_tree') tool.description += '\nSuccessful observations include snapshot_session_id and snapshot_revision for same-device conditional input. Compact errors preserve the error and cannot authorize an expectation.'
  if (tool.name === 'run_journey') tool.description += '\nTap steps may include expectedState from a successful same-device get_ui_tree. A failed condition blocks that input, retains fresh condition evidence even in compact mode, and stops subsequent steps. Conditions are not journey defaults or supported on other step types.'
  if (conditionalTools.has(tool.name)) {
    tool.inputSchema.properties.expectedState = expectedStateJson
    tool.inputSchema.properties.platform ??= { type: 'string', enum: ['android'] }
    tool.inputSchema.allOf = [...(Array.isArray(tool.inputSchema.allOf) ? tool.inputSchema.allOf : []), {
      if: { required: ['expectedState'] },
      then: { required: ['platform', 'deviceId'], properties: {
        platform: { enum: ['type_text', 'press_back'].includes(tool.name) ? ['android'] : ['android', 'ios'] },
        deviceId: { type: 'string', minLength: 1, pattern: '\\S', not: { enum: ['booted', 'default'] } }
      } }
    }]
    tool.description += '\n\nConditional input: optionally supply expectedState { snapshotSessionId, snapshotRevision, timeoutMs? } from a successful get_ui_tree on the same explicit platform/deviceId. A fresh normalized UI-tree check runs immediately before input, even with verification disabled. PRECONDITION_FAILED or PRECONDITION_UNAVAILABLE means no input was dispatched; inspect condition evidence and re-observe before deciding what to do next. Compact failures include the fresh UI tree. This is not atomic with OS input delivery.'
  } else {
    tool.inputSchema.allOf = [...(Array.isArray(tool.inputSchema.allOf) ? tool.inputSchema.allOf : []), { not: { required: ['expectedState'] } }]
  }
  if (['start_app', 'restart_app', 'tap', 'tap_element', 'swipe', 'scroll_to_element', 'type_text', 'press_back'].includes(tool.name)) {
    Object.assign(tool.inputSchema.properties, {
      verificationMode: { type: 'string', enum: ['none', 'light', 'full'], default: 'full' },
      responseMode: { type: 'string', enum: ['compact', 'debug'], default: 'debug' },
      actionTimeoutMs: { type: 'integer', description: 'Dispatch budget in milliseconds, clamped to 100–30000.' },
      verificationTimeoutMs: { type: 'integer', description: 'Light observation budget in milliseconds, clamped to 100–60000.' }
    })
  }
  if (tool.name === 'tap_element') Object.assign(tool.inputSchema, { oneOf: [{ required: ['elementId'], not: { required: ['selector'] } }, { required: ['selector'], not: { required: ['elementId'] } }] })
  if (tool.name === 'run_journey') Object.assign(tool.inputSchema.properties, {
    steps: journeyStepsJson,
    systemTraceId: { type: 'string', format: 'uuid', description: 'Explicit active same-device system trace. Invalid references prevent all journey input. Capture lifetime is controlled separately.' },
    captureOnFailure: { type: 'boolean', default: false },
    defaults: { type: 'object' as const, additionalProperties: false, properties: {
      verificationMode: { type: 'string', enum: ['none', 'light', 'full'] },
      actionTimeoutMs: { type: 'integer' }, verificationTimeoutMs: { type: 'integer' }
    } }
  })
}

// Correlation is explicit; an omitted reference creates an independent observation.
for (const tool of toolDefinitions) {
  tool.inputSchema.properties ??= {}
  if (['capture_screenshot', 'get_ui_tree', 'get_screen_fingerprint', 'capture_debug_snapshot', 'get_logs', 'read_log_stream'].includes(tool.name)) {
    Object.assign(tool.inputSchema.properties, { actionRef: {
      type: 'object' as const, additionalProperties: false, required: ['sessionId', 'actionId'], properties: {
        sessionId: { type: 'string', minLength: 1, maxLength: 128 },
        actionId: { type: 'string', minLength: 1, maxLength: 128 }
      }
    } })
    tool.description += '\nReturns evidence metadata with acquisition intervals and conservative freshness. Optional actionRef links a known same-session/device action; unavailable references collect independently. Device log times are not comparable with host dispatch times.'
  }
}
