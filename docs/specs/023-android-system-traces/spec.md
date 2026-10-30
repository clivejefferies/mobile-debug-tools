# Specification: Android system traces

[Design and evidence](../../README.md#design-and-evidence) · [Tool reference](../../tools/TOOLS.md) · [Intent](intent.md) · [Plan and verification](plan.md)

Date: 2026-10-30. Status: approved.
Source: [issue #67](https://github.com/clivejefferies/mobile-debug-tools/issues/67).
[Intent](intent.md) approved by the maintainer’s “yes” during design review.
Specification approved by “looks good” followed by “great” on 2026-10-30.

## Backend and boundaries

Use the device’s Perfetto CLI through existing ADB discovery/execution helpers.
Require Android API 29+, authorised ADB, supported background-wait options,
tracing services, and writable trace storage. Probe capabilities without starting
capture. No SDK installation, root, external downloads, Android CLI dependency,
or fallback to legacy systrace. iOS returns unsupported before side effects.
Android CLI is absent locally; official Android documentation supports direct
ADB capture. Analysis skills/SQL and trace interpretation remain out of scope.

## Tools and schemas

All objects reject unknown fields. IDs are opaque server-generated UUIDs.

- `get_system_trace_capabilities({platform, deviceId?})`: resolve one device;
  return supported/backend, resolved device, prerequisites, limitations, reasons.
- `start_system_trace({platform, deviceId?, durationMs?})`: integer duration
  1,000–120,000, default 30,000. Return recording session only after Perfetto’s
  data-source-start acknowledgement; otherwise return failure and cleanup result.
- `get_system_trace_status({traceId})`: reconcile owned process/deadline and return
  current state; finalise automatically completed capture when queried.
- `stop_system_trace({traceId})`: gracefully stop, retrieve and finalise artifact.
- `cancel_system_trace({traceId})`: stop and discard owned device/partial local
  files; return cancelled plus cleanup outcome. Completed artifacts are retained.

Trace ID determines the pinned device; control calls cannot redirect it. Unknown,
expired, or previous-server IDs return `TRACE_NOT_FOUND`. One recording per device,
maximum four server-wide; reject excess with `TRACE_BUSY`. Concurrent operations
on one session serialise; repeated terminal operations return the stored outcome.
Retain at most 100 terminal records for 10 minutes; expiry never deletes completed
artifacts. Starting/active records are not evicted.

Responses use JSON text with `trace_id`, `session_id`, `device`, `backend: perfetto`,
`state` (starting/recording/stopping/completed/cancelled/failed), `reason`,
`capture_started_at_ms`, `capture_completed_at_ms`, `completion_reason`
(requested/duration_limit/cancelled/error), `artifact`, `cleanup`, and
`correlation_ids`. Unreached values are null. Artifact is null or contains absolute
`path`, `format: perfetto`, and `size_bytes`. Cleanup reports pending/complete/failed
and remaining owned resources. Errors retain known session metadata, use MCP
`isError`, and distinguish INVALID_ARGUMENT, UNSUPPORTED_PLATFORM,
TRACE_UNSUPPORTED, TRACE_BUSY, TRACE_NOT_FOUND, TRACE_START_FAILED,
TRACE_STOP_FAILED, TRACE_ARTIFACT_FAILED, ACTION_TIMEOUT, and TRACE_CANCELLED.
Capability queries with unsupported prerequisites are normal supported:false results.

## Capture and lifecycle

Use a fixed scheduling/input/rendering preset (sched, freq, idle, am, wm, gfx,
view, input), 16 MiB ring buffer, and maximum output 32 MiB. Report enabled sources
and unavailable categories; unavailable required sched/input categories reject
start. No arbitrary config, package wildcard annotations, heap, screenshots, or
logcat data sources. This is device-wide evidence, not app-private capture.

Generate unique device paths under `/data/misc/perfetto-traces/`. Start with
background-wait and device-side duration limit. Record PID and process identity;
before SIGTERM validate both identity and unique output path. Never kill by process
name or signal a reused/unverified PID. Poll boundedly for termination before pull;
uncertain stop yields failure, never a successful artifact. Allow 35 seconds for
start acknowledgement, 10 for stop, and 30 for pull; subprocesses must terminate
on deadlines. Failed cleanup is explicit and retryable through control calls.

A server timer stops/finalises at duration; device duration also bounds capture
if the server dies. Normal shutdown attempts owned cleanup within 10 seconds;
crash recovery is not promised. A crash may leave its uniquely named device file
for manual removal; no restart-wide sweep. Host subprocess termination alone is
never reported as stopping device capture.

Pull into a unique server-created temporary directory with restrictive permissions;
rename only after successful transfer and nonempty size <=32 MiB. Return paths,
never binary/base64 contents. Remove owned device files after verified pull, retain
local artifacts for user-managed deletion. Pull failure retains bounded device
output for retry; cancelled partial files are removed. No upload or telemetry.

## Journey and evidence association

Add optional `systemTraceId` to `run_journey`. Validate active same-server,
same-device recording before any journey input; mismatch/inactive ID fails without
executing steps. Preserve existing journey semantics and correlation IDs. It is
explicit bracketing: start, run journey, stop; journeys do not own trace lifetime.
A failed journey leaves capture available for stop/cancel or duration expiry.

Extend evidence `trace_context` for explicitly linked journey/step observations:
`supported:true`, `trace_id`, `markers:[]`. Otherwise preserve the existing
unsupported/null context. Record linked journey correlation IDs in trace metadata;
report capture ending during a journey as partial coverage. No injected device
markers, clock synchronisation, causal claims, or inferred associations. Host UTC
intervals and monotonic duration do not claim alignment with device trace clocks.

## Acceptance and verification

1. Capability detection and invalid arguments cause no recording side effects.
2. Emulator start → existing Settings journey → stop produces a nonempty local
   Perfetto artifact and matching trace/journey evidence IDs; inspect with an
   available trace parser/viewer before claiming valid Perfetto content.
3. Duration completion, explicit cancel, repeated controls, same-device contention,
   concurrent devices, stale IDs, PID reuse and cleanup failures have deterministic tests.
4. Test missing tools/services, start/stop/pull timeout, device disconnect, partial
   transfer, shutdown, and journey mismatch; report real-device gaps explicitly.
5. Existing clients without tracing retain contracts. Run maintainer verification,
   automated device suite, and focused updated-server trace journeys.

Affected: new observe/session adapter, tool registration/validation/handlers,
journey schema/execution, evidence context/types, lifecycle shutdown, tests,
README/tool docs/changelog. Main risks: platform source availability, process
ownership races, finalisation correctness, storage/privacy, and absent parser.

Baseline: local package 0.33.0; emulator-5554 Android API 36 exposes Perfetto
background-wait, bounded output, and graceful PID-stop options. Pixel 9 Pro is
also connected but untested. ADB inspection passed after sandbox escalation;
no capture or new behaviour has been verified. Physical-device and iOS tests
remain unrun. Approval of this complete specification authorises implementation.

Sources: [Android Perfetto CLI](https://developer.android.com/tools/perfetto),
[Perfetto background capture](https://perfetto.dev/docs/learning-more/tracing-in-background).
