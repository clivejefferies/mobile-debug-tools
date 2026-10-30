# Specification: Android runtime debugger

Date: 2026-10-30. Status: approved.
Intent: [approved intent](intent.md), approved by the user's “yes” in this conversation.
Source: [issue #68](https://github.com/clivejefferies/mobile-debug-tools/issues/68).

## Behaviour and supported environment

Provide managed Java/Kotlin bytecode debugging of running, debuggable Android
apps using an independently developed Java JDI worker over ADB-forwarded JDWP.
No Debroid implementation or artifacts are reused. Require host JDK 17+ with
`jdk.jdi` and `javac`, Android platform-tools, an authorized Android device, and
a JDWP-visible app process. Package worker sources with the npm distribution;
compile into a private, version-keyed host cache on first use. Missing tooling
must not prevent ordinary MCP tools or server startup.

Initial verification target: API 36 arm64 emulator; other Android versions and
physical devices require separate evidence. iOS, native frames, expression
evaluation, method invocation, mutation, coroutine reconstruction, heap capture,
launch-under-debugger, and changing app debuggability are excluded. Kotlin
inspection follows emitted JVM/DEX debug metadata; do not promise source-level
coroutine or inline-function reconstruction.

## MCP contracts

All new inputs reject unknown fields. Strings are nonempty and bounded to 512
characters unless otherwise stated; IDs are opaque server-issued strings.
Every tool accepts `timeoutMs` (integer 100–30000, default 10000); event waits
default to 1000. Tables list other inputs; `?` means optional.

| Tool | Inputs | Result payload |
| --- | --- | --- |
| `get_debugger_capabilities` | `platform: android`, `deviceId`, `appId`, `processId?` | Prerequisites, candidate processes, supported operations and limitations; no attach |
| `attach_debugger` | `platform: android`, `deviceId`, `appId`, `processId?` | Session and resolved target |
| `get_debugger_state` | `debugSessionId` | Current state, stop summary, breakpoint statuses, cleanup |
| `set_debugger_breakpoint` | `debugSessionId`, `className`, `line` | Breakpoint ID, requested/resolved locations, `pending`/`verified`/`rejected` |
| `remove_debugger_breakpoint` | `debugSessionId`, `breakpointId` | Removal outcome; repeated removal of an owned ID succeeds |
| `wait_for_debugger_event` | `debugSessionId`, `afterSequence?` | Ordered events, next cursor and explicit overflow indication |
| `get_debugger_stack` | `debugSessionId`, `stopId`, `threadId`, `offset?`, `limit?` | Frames, opaque frame IDs and pagination |
| `get_debugger_locals` | `debugSessionId`, `stopId`, `frameId` | Bounded shallow local values and availability |
| `step_debugger` | `debugSessionId`, `stopId`, `threadId`, `kind: into/over/out` | Acknowledged transition to running; await a later event separately |
| `resume_debugger` | `debugSessionId`, `stopId` | Acknowledged resume |
| `detach_debugger` | `debugSessionId` | Terminal state and cleanup; idempotent and usable for cleanup retry |

`processId` and `line` are positive safe integers. Omitted process ID is allowed
only when exactly one matching app process is JDWP-visible. Resolve package UID,
process name, PID and process-start identity before and after attach; reject
ambiguity, mismatch or PID reuse. Never select the first connected device.

Responses use existing MCP text JSON serialization:
`{success, debug_session_id, device, target, state, captured_at_ms, capabilities,
limitations, cleanup, ...payload}`; pre-session fields may be null. Target includes
app ID, PID, process name and process-start identity. Failures add
`error: {code, message, retryable}`. Codes cover `INVALID_ARGUMENT`,
`DEBUGGER_UNSUPPORTED`, `DEVICE_UNAVAILABLE`, `PROCESS_NOT_FOUND`,
`PROCESS_AMBIGUOUS`, `PROCESS_CHANGED`, `DEBUGGER_BUSY`, `DEBUGGER_ATTACH_FAILED`,
`DEBUGGER_NOT_FOUND`, `DEBUGGER_NOT_PAUSED`, `DEBUGGER_STALE_REFERENCE`,
`DEBUGGER_LOCATION_UNAVAILABLE`, `DEBUGGER_DISCONNECTED`, `DEBUGGER_TIMEOUT`,
`DEBUGGER_CANCELLED`, `DEBUGGER_WORKER_FAILED`, and `DEBUGGER_CLEANUP_FAILED`.
No automatic retry of attach, step or resume. Do not claim command delivery
establishes a later stop or UI outcome.

## Stops, inspection and events

States: `attaching`, `running`, `paused`, `detaching`, `detached`, `disconnected`,
`failed`. Serialize state-changing commands per session; event polling must not
block resume/detach. One active session per device, at most four per server.
Reject an existing debugger attachment without replacing it.

Breakpoints use exact binary class names and 1-based lines, without arbitrary
source paths. Bind all matching executable locations in loaded class loaders;
report class-loader identity and resolved source/line. Unloaded classes remain
pending via class-prepare requests. Missing executable lines/debug metadata are
explicitly unavailable; never silently move the breakpoint. Limit 100 breakpoints.

Breakpoint and step events suspend all app threads. Retain owned EventSets and
resume through their matching ownership; do not decrement unrelated suspension
counts. Non-stop events are promptly released. Each new stop has a unique
`stopId`, triggering thread ID, reason, locations and matching breakpoint IDs.
Simultaneous events share a stop summary. Step uses one-shot line stepping on
the chosen suspended thread; a competing breakpoint also completes that step
attempt and removes its request. A step acknowledgement does not wait for a stop.

Thread/frame IDs are stop-scoped. Resume, step, disconnect and detach invalidate
all inspection references before further commands can use them. Stack pagination
defaults to 20, maximum 100 per call and 1000 frames per stop. Locals return at
most 100 entries: primitives, null, strings truncated to 256 characters, and
object type/opaque identity summaries, without field traversal or `toString()`.
Expose truncation and missing debug metadata; unavailable locals are distinct
from a proven empty scope. Investigation found ART may return an empty variable
table without distinguishing absent metadata from no variables; report availability
as unknown with `EMPTY_OR_UNAVAILABLE_VARIABLE_METADATA`, rather than inferring an
empty scope. No retained object pinning.

Maintain a 256-event ring per session with increasing sequence, host receipt time,
kind and optional stop summary. Default cursor is zero; return at most 100 events
and a continuation cursor. Cursor overrun is explicit. Reject future cursors;
an empty wait returns success with `timed_out: true`, without changing the session.

## UI coordination and resource safety

While a session is paused, conservatively block action dispatch, lifecycle/data
management, and UI waits/assertions on that device with `DEBUGGER_PAUSED` before
native work. Journeys stop with completed steps preserved and no automatic retry.
Check at dispatch and within polling; a pause racing an already dispatched action
must preserve delivery evidence and mark verification blocked. Do not queue inputs
for resume. Use a device dispatch gate to serialize pause transitions with input
submission; inputs already submitted cannot be retracted.

Readiness tools return evidence-backed `debugger_paused` with debug session/target
identity and host timestamp without acquiring a UI tree. This is device-scoped
blocking evidence, not proof the paused app is foreground. Screenshots, raw trees
and logs remain available within their existing bounds and carry the known pause
annotation; their success does not establish readiness. Other devices and iOS
retain existing behaviour. Unknown/disconnected debugger state cannot imply pause.

Detach automatically after 60 seconds continuously paused, five minutes without
client activity, or 30 minutes total session lifetime; polling cannot extend the
pause/total limit. Emit the expiry reason. Timeouts/cancellation of inspection
leave a known session intact; uncertain state-changing commands trigger teardown
and invalidate references. Cancelling an event wait only cancels that wait.

Cleanup has its own ten-second deadline: remove owned requests, release owned
suspensions/dispose the JDI connection, stop the owned worker, and remove only
the session's exact ADB forward. Never kill/restart the app, ADB server or another
debugger. On worker failure, disconnect its transport and verify obtainable
cleanup facts; never claim the app resumed without evidence. Report cleanup as
`pending`/`complete`/`failed`, remaining resources and execution state as unknown
when necessary. Block new sessions on that device until owned cleanup completes.
The worker watches parent-pipe EOF; server shutdown also requests cleanup. Abrupt
host/device loss may prevent confirmed cleanup and must be documented explicitly.

Use argv-based subprocesses and a dedicated worker with bounded JSON-lines IPC
(1 MiB/message), request IDs and stderr-only diagnostics. JDI runs through an
owned loopback forward, never a public listener. Whitelist commands; do not log
locals or protocol values. Locals may contain sensitive data and are returned
only on request; no persistent inspection dump or upload. Retain up to 100 terminal
session summaries for ten minutes, clearing locals, frames and events at teardown.

## Acceptance and verification

1. A dedicated debuggable Java fixture attaches on the selected device/process;
   ambiguous, non-debuggable, replaced and already-debugged targets fail safely.
2. Pending/loaded breakpoints stop at the expected line; stack and known local
   values are correct; each step mode and resume produce observed execution.
3. Old stop/frame/thread references fail after resume; missing metadata and
   truncation are explicit.
4. UI action/wait/readiness tools recognise pauses, including mid-journey stops;
   another device is unaffected and resumed UI changes are independently verified.
5. Explicit detach, expiry, cancellation, disconnect and worker failure invalidate
   references and clean up owned resources without altering unrelated forwards.

Use focused self-running unit tests plus a new isolated fixture with debug line
and local-variable tables. Run `npm run verify`, `npm run test:device`, and focused
end-to-end calls through the updated server. Record exact build/device and each
journey as pass/fail/blocked/unrun. Current CI uses Node 18; manual Android CI uses
JDK 17/API 30. Existing smoke tests do not prove debugger behaviour; add worker
compilation/packaging checks and explicit debugger coverage.

Affected areas: new debugger/worker modules, tool definitions/handlers, readiness,
interaction dispatch/polling, lifecycle guards, shutdown, native-tool status,
packaging, fixtures/tests and tool/README/changelog documentation. Correct existing
JDWP capability reporting: ADB/device presence alone is not debugger readiness.

## Investigation and approval

Checkout 0.33.0 contains no debugger implementation. Host Java 23 and ADB 37.0.1
are available; outside sandbox, `emulator-5554` is online (API 36 arm64). Existing
latency fixture lacks `android:debuggable`; a dedicated fixture is required.
No debugger session was attached and no debugging journey is verified yet.

Primary references: [JDI VM lifecycle](https://docs.oracle.com/en/java/javase/17/docs/api/jdk.jdi/com/sun/jdi/VirtualMachine.html),
[EventSet suspension ownership](https://docs.oracle.com/en/java/javase/21/docs/api/jdk.jdi/com/sun/jdi/event/EventSet.html),
[frame lifetime](https://docs.oracle.com/en/java/javase/17/docs/api/jdk.jdi/com/sun/jdi/StackFrame.html),
[step requests](https://docs.oracle.com/en/java/javase/17/docs/api/jdk.jdi/com/sun/jdi/request/StepRequest.html),
and [ADB](https://developer.android.com/tools/adb). ART/JDI interoperability must
be established by fixture evidence; API documentation alone does not prove it.

The user approved this complete specification with “yes” on 2026-10-30 in this
conversation, including all-thread
suspension, conservative device-wide UI blocking, shallow locals, JDK dependency,
and automatic detach limits. Implementation is authorized within this scope.
