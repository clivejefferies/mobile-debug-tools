# Android runtime debugger

[Documentation](../README.md) · [Tool reference](TOOLS.md)

Optional managed Java/Kotlin bytecode debugging through an independently developed
JDI worker. Requires JDK 17+ (`java`, `javac`, `jdk.jdi`), Android platform-tools,
an authorized device and an already-running JDWP-visible debuggable app.
Android Studio JBR/standard JDK discovery follows existing Java helpers; `ADB_PATH`
is supported. The worker is compiled on demand into a private source/JDK-keyed
host temporary cache. Ordinary tools do not require Java or start a debugger.
Cache directories named `mobile-debug-jdi-*` can be removed when the server exits.

## Tools and flow

1. `get_debugger_capabilities` with `platform: "android"`, explicit `deviceId`,
   `appId`, and optional positive `processId` probes prerequisites/candidate processes.
   General `get_system_status` does not establish target-specific debugger readiness.
2. `attach_debugger` with the same target returns `debug_session_id`. If multiple
   matching debuggable processes exist, provide `processId`. Package UID, process
   name, PID and process-start identity are checked. Other debuggers are not replaced.
3. `set_debugger_breakpoint` takes `debugSessionId`, exact binary `className` and
   1-based executable `line`. It returns `result.breakpoint_id`, status and resolved
   source locations/class-loader IDs. Unloaded classes remain `pending`; missing
   line metadata is rejected explicitly. No automatic source search/line relocation.
4. Trigger execution, then `wait_for_debugger_event` with `debugSessionId` and
   `afterSequence` (initially zero). Retain `next_cursor`. Stop events contain
   `stop_id`, `thread_id` and source locations. A step acknowledgement is not a stop.
5. `get_debugger_stack` takes `debugSessionId`, `stopId`, `threadId`, optional
   `offset` and `limit` (20 default, 100 maximum; 1000-frame cap).
   `get_debugger_locals` takes `debugSessionId`, `stopId`, `frameId`. It returns
   `result.availability`, up to 100 shallow locals, and truncation information.
   Primitive values are textual; strings truncate at 256 characters; objects have
   type/identity summaries. Missing variable metadata is explicit. ART can return an empty table without
   distinguishing absent metadata from a genuinely empty scope; these responses
   use `availability: "unknown"`, `reason: "EMPTY_OR_UNAVAILABLE_VARIABLE_METADATA"`.
6. `step_debugger` takes `debugSessionId`, current `stopId`, `threadId` and
   `kind: "into" | "over" | "out"`. It resumes and requests one line step.
   `resume_debugger` takes `debugSessionId`, `stopId`. Both expire all old stop,
   thread and frame references. Await the next stop using the event cursor.
7. `remove_debugger_breakpoint` takes `debugSessionId`, `breakpointId` and is
   idempotent for an owned ID. `get_debugger_state` reads stop, breakpoint, terminal
   reason and cleanup status. `detach_debugger` disposes the session and supports
   repeated calls/retrying incomplete cleanup.

Every tool accepts integer `timeoutMs`, 100–30000 (default 10000; event waits
1000). Unknown arguments are rejected. Other strings are limited to 512 characters.
All session tools use camelCase input IDs; response fields use snake_case.
Successful operation payloads are under `result` where applicable; common fields
include `success`, `debug_session_id`, `device`, `target`, `state`,
`captured_at_ms`, `capabilities`, `limitations`, `cleanup`, `reason`, and `stop`.
Failures carry `error: {code, message, retryable}`. Event polls use top-level
`events`, `next_cursor`, `overflow`, `timed_out`; empty waits are successful.
The 256-event ring returns at most 100 entries; overflow must not be ignored.

## Response modes

All eleven debugger tools accept `responseMode: "compact" | "debug"` (default
`"debug"`, the existing full response). Selection applies only to the current call.
For routine session commands, compact mode omits only top-level `device`, `target`
and `capabilities` when `debug_session_id` is non-null. Attach, capabilities and
state calls retain their full payload in either mode. Use `get_debugger_state`
or request `debug` to recover target/capability context.

Errors and sanitized diagnostics, identifiers, stop and execution state, event
cursors/overflow, limitations, truncation and cleanup remain intact. Unknown
session IDs still fail explicitly. Compact mode does not redact locals or prove
execution resumed: detach retains `execution_state: "unknown"`. Retry incomplete
cleanup according to its remaining resources. Invalid modes are rejected.

## Failure diagnostics

Debugger operation failures add `error.diagnostic: {stage, reason, recovery}` while
preserving existing error codes, messages and retryability. `stage` identifies
prerequisite checks, compilation, worker startup, IPC, target resolution,
forwarding, JDI attach, command execution, transport or cleanup; `unknown` is
explicit when evidence is insufficient. `reason` is a fixed classification,
such as `spawn_failed`, `process_exited`, `invalid_message`, `message_limit`,
`write_failed`, `connection_refused`, `transport_lost`, `timeout` or `cancelled`.
Remaining catalog values and the exact schema are defined in the
[accepted specification](../specs/027-debugger-failure-diagnostics/spec.md).

`recovery` is static guidance, not raw stderr or exception text. Each diagnostic
is at most 512 UTF-8 bytes with guidance at most 240 ASCII characters. Untrusted
worker fields are validated and reconstructed. No new logging or app-value
collection is introduced. Startup classification means no valid worker reply had
yet arrived; it does not establish the underlying cause of an unexpected exit.
Argument, stale-reference and pause/state validation errors may omit diagnostics.

Capability probes retain `success: true` and `supported: false` for unavailable
prerequisites; optional top-level `diagnostics` contains at most two entries,
ordered JDK then target. Successful probes omit it. Terminal session failures
retain sanitized diagnostics until normal summary expiry, even after inspection
data is cleared. A cleanup failure has its own diagnostic; inspect the existing
session reason and `cleanup.remaining_resources` as well.

Follow recovery guidance and inspect session/cleanup state before another
state-changing command. Timeout or cancellation does not prove nondelivery.
Retry incomplete cleanup with `detach_debugger`; never automatically retry
attach, step or resume, or kill the app/ADB server. Diagnostics improve failure
classification and do not establish the cause of a previously intermittent error.
This contract applies to the Android backend; iOS debugging remains unsupported.

## Suspension, limits and cleanup

Stops suspend all app threads. UI actions, app lifecycle/data changes, waits and
assertions on that device return `DEBUGGER_PAUSED`; inputs are not queued. A pause
racing input submission preserves delivery uncertainty and blocks verification.
Journeys preserve completed steps. Other devices are unaffected.

`get_app_readiness` returns evidence-backed `debugger_paused` without reading the
UI; readiness waits fail with `DEBUGGER_PAUSED`. This signal covers managed Android
sessions only and does not establish foreground app identity. Raw trees, screenshots
and logs remain available within their own timeouts; snapshot/log acquisition may
still fail while the app is suspended. Known pauses are annotated on observations.

The worker and host enforce automatic detach after 60 seconds continuously paused,
five minutes without client commands or 30 minutes total. Polling cannot extend
the pause or total limit. One active session per device, four per server; at most
100 distinct breakpoint IDs per session. Terminal summaries expire after ten
minutes and are capped at 100; inspection values and event history are cleared.

Detach releases debugger-owned suspension and removes only owned requests,
worker and the exact ADB forward. Cleanup is bounded separately to ten seconds;
retry `detach_debugger` if `cleanup.status` is `failed`. Never kill an app or ADB
server to clean up. Unexpected worker/transport loss reports execution state as
unknown; no resumption claim is inferred. Hard host/device loss can prevent
confirmed cleanup. Server shutdown and worker parent-pipe EOF request cleanup.

MCP request cancellation is supported. Cancelling an event wait leaves the
session intact. Inspection cancellation/timeouts preserve a known session;
uncertain mutation/attach outcomes trigger teardown. Do not automatically retry
step, resume or attach.

## Limits, privacy and evidence

There is no expression evaluation, object traversal, method invocation, mutation,
coroutine reconstruction, native debugger, iOS debugger or heap capture. Kotlin
results follow emitted bytecode/debug metadata; optimized/obfuscated apps may lack
useful source lines or locals. Locals may contain private data: values are returned
only on request, without protocol/value logging, persistent dumps or upload.
Worker heap is capped at 128 MiB; IPC and messages are bounded; forwarding remains loopback-only.

For Kotlin, stop after a local's assignment before expecting its value. A stop
on the assignment line may precede initialization and the compiler's variable
scope. Compare source location and emitted debug tables before classifying a
missing local as a debugger failure. The isolated
[Kotlin validation](../specs/029-kotlin-locals-validation/report.md) covers a plain
calculation; it does not establish coroutine, inline/suspend, optimized or
obfuscated-code support.

Verified environments and remaining checks are recorded in
[the implementation plan](../specs/025-android-runtime-debugger/plan.md).
To run the isolated fixture journey (installs then removes its own test package):

```sh
MCP_DEBUGGER_DEVICE=emulator-5554 npx tsx test/device/automated/debugger/runtime.android.test.ts
# Exercise opt-in compact responses across the same assertions:
MCP_DEBUGGER_DEVICE=emulator-5554 MCP_DEBUGGER_RESPONSE_MODE=compact npx tsx test/device/automated/debugger/runtime.android.test.ts
# Also exercise the real 60-second pause expiry:
MCP_DEBUGGER_DEVICE=emulator-5554 MCP_DEBUGGER_EXTENDED=1 npx tsx test/device/automated/debugger/runtime.android.test.ts
```

The ordinary device suite explicitly reports this journey unrun unless the device
is selected. Fixture compilation requires SDK platform/build-tools 36 and `javac -g`.

## Related guides

- [App management](manage.md): build, install, and launch the app before attaching.
- [App readiness](observe.md#app-readiness): understand known debugger-pause evidence.
- [Android system traces](system-traces.md): investigate performance without paused-state inspection.
