# Android runtime debugger

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

Verified environments and remaining checks are recorded in
[the implementation plan](../specs/025-android-runtime-debugger/plan.md).
To run the isolated fixture journey (installs then removes its own test package):

```sh
MCP_DEBUGGER_DEVICE=emulator-5554 npx tsx test/device/automated/debugger/runtime.android.test.ts
# Also exercise the real 60-second pause expiry:
MCP_DEBUGGER_DEVICE=emulator-5554 MCP_DEBUGGER_EXTENDED=1 npx tsx test/device/automated/debugger/runtime.android.test.ts
```

The ordinary device suite explicitly reports this journey unrun unless the device
is selected. Fixture compilation requires SDK platform/build-tools 36 and `javac -g`.
