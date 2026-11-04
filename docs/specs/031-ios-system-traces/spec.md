# iOS system traces — proposed specification

2026-11-04. **Approved** by the user's second “ok” in this chat, responding to
the complete specification and implementation approval request.
[Intent](intent.md) approved by the user's “ok” in this chat.
Source: [issue #78](https://github.com/clivejefferies/mobile-debug-tools/issues/78).
[Native investigation and limits](investigation.md).

## Supported scope

Extend the existing five system-trace tools with an Instruments backend on macOS
with full Xcode. Initial supported combination: booted iOS simulator and Time
Profiler, attached to an already running development app. Baseline is Xcode 27.2
and iOS 26.4.1. Other versions require successful prerequisite checks and artifact
validation; installed templates alone do not establish support.

System Trace is discoverable but not enabled initially: the simulator probe did
not establish scheduling data. Animation Hitches is unsupported on the tested
simulator. Hangs is an instrument within Time Profiler here, not a selectable
standalone template; do not promise detected hangs. Physical-device capture is
explicitly unsupported in this initial release, with verification unrun because
no device is available. Report pairing, Developer Mode, signing/profiling and
symbol prerequisites as applicable setup guidance, never as completed checks.
Expanding this matrix requires evidence and a specification revision.

No host recording, all-processes mode, custom templates, app launching, automatic
diagnosis, summaries, arbitrary queries, or public export API. Android retains
its existing preset, inputs, results and verification requirements.

## Tools and contracts

Keep existing names and strict schemas. Extend capabilities and start inputs with
optional `appId` (nonblank bundle identifier) and `template` enum
`System Trace | Time Profiler | Animation Hitches | Hangs`. These fields are
iOS-only; reject them on Android. iOS start requires explicit `deviceId` and
`appId`; omitted template defaults to Time Profiler. Capabilities require explicit
`deviceId` on iOS; `appId` optionally probes running-app readiness. Duration stays
1,000–120,000 ms, default 30,000. Controls still accept only `traceId`.

iOS capabilities return `backend:xctrace`, resolved simulator/device metadata,
Xcode version, discovered templates, per-template support/reasons/coverage,
prerequisite states (`available`, `missing`, `unknown`), and actionable recovery.
Discovery starts no recording and grants no permissions. Distinguish unavailable
tooling/target, unsupported matrix, app not running, permission failure and checks
that only a recording can establish. Do not label unknown permissions as granted.

Reuse session state, completion reasons, IDs, host bounds, cleanup and correlation
fields. Extend result unions to iOS, `backend:xctrace`, and artifact
`format:instruments` with absolute `.trace` path, recursive `size_bytes`, and
`kind:directory|file`. Include pinned `app_id`, PID, executable identity,
selected template, target type, warnings and validation result. Never return raw
trace data. Unreached fields are null. Errors use existing MCP `isError` and
TRACE_* codes; bounded reason/recovery values distinguish setup, permission,
target disconnect, readiness, export and storage failures without raw stderr.

Resolve bundle identity to one current executable/PID on the pinned simulator;
ambiguous/missing identity fails. Always pass `--device <UDID>` and revalidate
identity before starting. Do not retry against a different process/name, template,
device or host. Exported target UUID, PID and template must match the session.

## Lifecycle, limits and privacy

Use uniquely owned mode-0700 temporary directories and fixed argument arrays.
Spawn the recorder with `--time-limit`, unique output and unique
`--notify-tracing-started` notification. Register an owned Darwin-notification
listener before spawning; return recording only after that notification while
the recorder remains live. Console “Starting recording” alone is insufficient.
Notification helper availability is a prerequisite, never a silent fallback.

Allow 35 seconds for readiness, 30 seconds for graceful stop/finalisation and
30 seconds for validation. Bound every child process and cap captured diagnostic
output. At requested duration, reconcile and finalise automatically. SIGINT only
the session-owned recorder; after its grace deadline terminate that owned child
and report failure/partial output. Never signal the app, by process name, or an
unrelated Instruments recording. On server shutdown cancel owned sessions under
one 10-second overall deadline; forced cleanup may leave an unreadable artifact
and must report that. Crashes provide no cleanup guarantee; no restart-wide sweep.

Share the existing one-session-per-device, four-active-session server limit across
backends. Serialise controls; retain 100 terminal metadata records for ten minutes.
Stale/other-server IDs fail. Completed controls are idempotent. Disconnect,
premature recorder exit and journey failure have explicit outcomes; journey failure
does not cancel capture. Retry validation only on an existing finalised owned
bundle, never restart recording. Cancel removes owned partial output; completed
artifacts remain user-managed.

Poll recursive output size every second; stop/discard on exceeding 256 MiB per
iOS session, reject starts with less than 1 GiB free in its output filesystem.
Finalisation can temporarily overshoot the polling threshold: report this as a
soft bound, reject oversized final output and remove it. No symlink traversal.
Apply restrictive permissions recursively before returning validated output.
Instruments may contain system-wide metadata, paths, symbols, logs and signposts
despite app attachment. Disclose this in tool/skill documentation. No upload,
telemetry or permission bypass, including `--no-prompt`. User handles any required
OS permissions outside the tool.

## Artifact and journey evidence

Require successful recorder exit, nonempty bounded output, parseable
`xctrace export --toc`, matching target/app/template metadata, expected
`time-sample` schema and successful table export. Record row count, including zero;
zero samples means no CPU sample evidence, not diagnosed inactivity. Do not call
a failed recording valid merely because a readable partial bundle exists.
Expose warnings and unavailable instruments; do not claim symbolication unless
verified. Validation exports are private temporary data removed after validation.

Keep `run_journey.systemTraceId` explicit. Validate active same-server,
same-platform/same-UDID session before any journey input. Link journey and step
evidence through existing trace context and correlation IDs. The trace pins the
profiled app; journey actions retain their existing targeting semantics and may
leave that app. Report that limitation. Duration expiry or stop during the journey
means partial coverage. Host capture bounds and unknown device-clock alignment
establish association only; no device markers or causal inference.

## Acceptance and verification

1. Capability matrix and rejected inputs are side-effect-free, with exact target
   and actionable prerequisite reasons; unknown permissions stay unknown.
2. Updated-server simulator Time Profiler start → existing fixture journey tapping
   Show loader and asserting Done → stop yields matching IDs, target/app metadata,
   notification-before-input evidence, readable bundle and exported sample rows.
3. Deterministic checks cover stale/mismatched IDs preventing all input, ownership,
   concurrency, expiry, cancellation, partial coverage, disconnect, identity races,
   notification/start/stop/export/storage failures, retries and shutdown cleanup.
4. Real simulator checks cover explicit stop, expiry, cancellation and failed
   journey; unavailable physical/failure-injection evidence is separate from mocks.
5. Existing Android traces and untraced journeys pass regression checks. Run
   `npm run verify`, applicable `npm run test:device`, and focused updated-server
   calls; report actual suite coverage and unrun platforms.

Affected: trace sessions/adapters/types, schemas/registration/handlers, journey and
evidence integration, shutdown, tests/goldens, tool docs, README, changelog and
packaged usage skill. Main implementation risks remain notification readiness,
reliable app identity resolution and finalisation deadlines; feasibility probes
do not establish these acceptance criteria.
