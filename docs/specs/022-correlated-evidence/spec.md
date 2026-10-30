# Specification: correlated evidence

[Design and evidence](../../README.md#design-and-evidence) · [Tool reference](../../tools/TOOLS.md) · [Intent](intent.md) · [Plan and verification](plan.md)

Date: 2026-10-29. Status: approved.
Source: [issue #66](https://github.com/clivejefferies/mobile-debug-tools/issues/66).
[Intent](intent.md) approved by “yes”; this specification approved by the
maintainer’s “approve” on 2026-10-29 during design review.

## Scope and association

Add metadata to `start_app`, `restart_app`, `tap`, `tap_element`, `swipe`,
`scroll_to_element`, `type_text`, `press_back`, `adjust_control`, their
`run_journey` execution, and internal observations. Observation coverage:
`capture_screenshot`, `get_ui_tree`, `get_screen_fingerprint`,
`capture_debug_snapshot`, `get_logs`, `read_log_stream`.

Allocate action IDs before execution; reuse them in results, traces, and nested
observations. Journey steps share one correlation ID but retain individual action
IDs. Standalone actions use their action ID as correlation ID. Independent
observations receive a new correlation ID without an associated action.

Observation tools accept optional `actionRef: { sessionId: string, actionId:
string }`; strings must contain 1–128 characters. Malformed references return
`INVALID_ARGUMENT` before collection. Associate only known same-session,
same-device actions; never infer “last action”. Unknown/expired references allow
independent collection, retaining the requested reference and association reason.
Restart changes session ID. Retain completed action records for 10 minutes,
maximum 1,000, evicting oldest first; active records belong to running calls.

## Response contract

Add `evidence` to the first JSON text block in compact/debug responses; snapshots
place it alongside `raw`/`semantic`. Preserve existing fields, image blocks,
ordering, IDs, timestamps, and elapsed timings. Log metadata describes the
following log block.

| Field | Contract |
| --- | --- |
| `session_id`, `correlation_id`, `action_id` | Action ID nullable when unassociated. |
| `device` | Resolved platform/ID, nullable before resolution; app/PID only when resolved. UI scope is device-wide. |
| `association` | `self`, `explicit`, `internal`, `none`, `unavailable`. |
| `association_reason` | Null or `ACTION_UNAVAILABLE`, `SESSION_MISMATCH`, `DEVICE_MISMATCH`. Unavailable association has null action ID and independent correlation ID. |
| Phase timestamps | `operation_started_at_ms`, `operation_completed_at_ms`, `dispatch_started_at_ms`, `dispatch_completed_at_ms`, `verification_completed_at_ms`; unreached/uninstrumented phases null. |
| `observations` | Component records defined below. |
| `trace_context` | `{ supported: false, trace_id: null, markers: [] }`; future tracing can reuse these identifiers. |

Each component has unique `evidence_id`, `kind` (screenshot/ui_tree/fingerprint/
activity/logs), `status` (`captured`, `failed`, `omitted`),
`capture_started_at_ms`, `capture_completed_at_ms`, nullable
`source_captured_at_ms`/`age_ms`, `freshness`, and `freshness_reasons`.
Retain component errors and UI-tree snapshot session/revision references.
Snapshot components, including fallback logs, have individual acquisition intervals.

## Timing and freshness

New epoch times use server UTC milliseconds; monotonic time governs ordering,
durations, and retention. Clock reversal yields `CLOCK_DISCONTINUITY`, unknown
freshness, and null age. Acquisition intervals bound server collection, not exact
device frame time. Instrument actual dispatch after conditional checks;
multi-input actions report first start/last completion. Preserve known times on
failure. Verification completion includes timeout/failure, is null when skipped,
and never overrides verification status.

Assess freshness at response assembly:

| Evidence | Freshness / reason |
| --- | --- |
| New successful visual acquisition, no intervening known dispatch on that device | `fresh`; no guarantee the app stayed unchanged. |
| Before associated action’s dispatch | `stale` / `BEFORE_ACTION`. |
| Overlapping dispatch | `unknown` / `OVERLAPPING_ACTION`. |
| Superseded by later covered dispatch | `stale` / `SUPERSEDED_BY_ACTION`. |
| Reused observation | Preserve source time; `unknown` / `REUSED_OBSERVATION` unless supersession proves stale. |
| Missing timing | `unknown` / `CAPTURE_TIME_UNKNOWN`. |
| Failed or omitted visual component | `unknown`. |
| Logs / omitted logs | `unknown` / `DEVICE_CLOCK_UNVERIFIED`; omitted logs `not_applicable`. |

Unassociated observations consider known concurrent dispatches. Age uses known
host source capture time, otherwise null; clients choose age limits. Conditional
safeguards remain unchanged. Preserve device log timestamps, declaring clock
`device_or_unknown`, nullable earliest/latest parseable entry times, and
`event_time_comparable: false`. Never infer emission freshness, causality, or
an action-window filter from collection time.

## Targeting, resources, and compatibility

Pin snapshot components to one resolved device. References never redirect targets;
stream reads use their stream’s device. Unknown scope means unknown freshness
and no matching association. Per-call asynchronous context isolates concurrent
calls/devices/steps; device dispatch ordering must not serialise independent calls.
Snapshots remain non-atomic.

Preserve existing errors, partial results, timeouts, and cancellation support;
attach available metadata on failure. Add no retries, deadline extensions,
processes, cancellation API, artifact removal, or stream termination. Release
call context on completion/cancellation; existing owners clean up subprocesses
and streams. History stores only IDs, scope, timings, and ordering: no captured
content, arguments, credentials, persistence, or telemetry.

Android ADB and iOS simulators share this contract; physical iOS retains provider
limitations. Exclude trace capture, clock synchronisation, debugger, recovery,
heap dumps, and background recording.

## Acceptance and verification

1. Referenced screenshots/logs share action identifiers in compact/debug responses.
2. Capture, dispatch, verification, skipped phases, precondition failures, timeouts,
   and multi-input actions have accurate distinguishable timings.
3. Freshness follows the table, preserving uncertainty and component outcomes.
4. Concurrent steps/devices, expired/mismatched references, and server restarts
   cannot falsely associate evidence.
5. Partial/disabled captures preserve existing responses; history is bounded/content-free.
6. Platform limitations and unsupported tracing are explicit.

Affected: server schemas/serialization, dispatch hooks, observation adapters,
shared types/context, journeys, tests, and tool/README/changelog docs. Risks:
missed dispatch paths, dropped metadata, retimestamped cache, wrong stream device.

Baseline (2026-10-29): checkout 0.32.4; connected build unverified. Discovery:
Android 16 emulator-5554, Pixel 9 Pro, iOS 26.4 iPhone 17 Pro simulator.
Android compact tree: revision 1, elapsed timing, no correlation/capture metadata.
Discovery/Android baseline passed; iOS capture/new behaviour unrun. Android logs
flagged unavailable by healthcheck; targeted read needed. Post-approval checks:
updated-server Android/iOS journeys, deterministic failure/concurrency coverage,
`npm run verify`, `npm run test:device`.
