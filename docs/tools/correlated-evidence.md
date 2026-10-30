# Evidence correlation

[Documentation](../README.md) · [Tool reference](TOOLS.md)

Use evidence correlation to connect an action with later screenshots, UI trees,
and logs, and to understand when those observations were captured. Association
does not prove that the action caused an observed change.

## Associate an observation with an action

Covered actions (`start_app`, `restart_app`, `tap`, `tap_element`, `swipe`,
`scroll_to_element`, `type_text`, `press_back`, `adjust_control`) return an
additive `evidence` object in their first JSON content block. Journey steps have
individual action IDs and share the journey correlation ID.

To associate a later observation, copy the action's `evidence.session_id` and
`evidence.action_id` into `actionRef`:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "actionRef": { "sessionId": "<evidence.session_id>", "actionId": "<evidence.action_id>" }
}
```

Supported observation tools: `capture_screenshot`, `get_ui_tree`,
`get_screen_fingerprint`, `capture_debug_snapshot`, `get_logs`, `read_log_stream`.
The reference object accepts only those two keys, each a string of 1–128
characters. Malformed references fail before collection. References never select
or redirect devices. A missing reference creates independent evidence; there is
no automatic association with the latest action.

Completed actions remain referenceable for 10 minutes, with at most 1,000 records
per server process. Restart changes the session. Unknown, expired, foreign-session,
or different-device references still collect independently: `association` is
`unavailable`, `association_reason` explains why, and `action_id` is null.

## Reading metadata

`session_id`, `correlation_id`, `action_id`, `device`, and `association` identify
the operation. Association is `self`, `explicit`, `internal`, `none`, or
`unavailable`. Target scope is the resolved device; UI evidence is device-wide.
`requested_action_ref` preserves an explicit reference, including unavailable ones.

Phase fields are server UTC epoch milliseconds:

- `operation_started_at_ms` / `operation_completed_at_ms`: this call.
- `dispatch_started_at_ms` / `dispatch_completed_at_ms`: actual action dispatch,
  first start through last completion for multi-input actions.
- `verification_completed_at_ms`: verification attempt completion, including
  failure or timeout; null when skipped. Read the existing verification status
  to determine its outcome.

Unreached/uninstrumented phases are null. Host monotonic time governs ordering
and retention. A detected clock reversal yields unknown freshness and null age.

`observations` contains separate screenshot, UI-tree, fingerprint, activity, and
log records. Each has `evidence_id`, device, component status (`captured`, `failed`,
`omitted`), acquisition start/completion, source capture time, age, freshness and
reasons. Tree records retain snapshot session/revision references. Failed records
preserve available errors; disabled captures are omitted. Snapshot components
are collected independently, including fallback log reads; they are not atomic.

Visual freshness is evaluated when the response is assembled:

| Status | Meaning |
| --- | --- |
| `fresh` | Newly acquired with no known intervening covered dispatch; app state may still change. |
| `stale` | Before the associated action or superseded by a later covered dispatch. |
| `unknown` | Overlap, reuse, failure, unknown scope/timing, or clock discontinuity. |
| `not_applicable` | Omitted logs. |

Cached source times are preserved. `age_ms` is nullable; clients choose their own
age limits. Freshness does not replace conditional-action safeguards.

Log timestamps remain on their original device/unknown clock. Log records expose
`clock: "device_or_unknown"`, `event_time_comparable: false`, and nullable earliest/
latest parseable entry times. Collection after an action does not prove emission
after it, or causality. No implicit action-window filtering is applied.

Existing payloads, image blocks, and log blocks remain available. Snapshot evidence
sits alongside `raw` and `semantic`. Android ADB and supported iOS simulators share
this contract; existing provider limitations still apply. `trace_context` defaults
to `{ "supported": false, "trace_id": null, "markers": [] }`. Journeys explicitly
linked to an active Android [system trace](system-traces.md) and their steps expose
`{ "supported": true, "trace_id": "…", "markers": [] }`; association does not align
clocks or inject device markers.
Correlation history stores identifiers, scope, timing, and ordering only, without
captured content, arguments, persistence, or telemetry.
