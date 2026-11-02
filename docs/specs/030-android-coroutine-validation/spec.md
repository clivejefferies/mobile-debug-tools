# Android coroutine validation specification — issue #93

Status: accepted by the maintainer’s second “ok” in this chat on 2026-11-02. Implements the
[accepted intent](intent.md), approved by “ok” in this chat on 2026-11-02.

## Outcome and compatibility

Establish what the existing Android JDI tools actually expose for an isolated
Kotlin coroutine, and publish a reproducible assessment. No server capability,
schema, response shape, error code or default changes. Android only; iOS runtime
debugging remains unsupported. Java and synchronous Kotlin fixture journeys
retain their current behaviour. Any reproduced production defect is reported
with evidence and handled separately through the shared process.

## Fixture and prerequisites

Add an opt-in coroutine variant of the disposable debugger fixture, built from
checked-in source using the existing direct Kotlin/D8/aapt2 pipeline. Initially
target Kotlin compiler/stdlib 2.0.21, kotlinx-coroutines-core-jvm 1.9.0, JDK 17,
Android SDK/build-tools 36 and Node 22+. Require explicit local dependency paths;
do not download dependencies at test runtime, add server dependencies, enable
debug probes or instrument user apps. Record actual versions and dependency
hashes. Missing or incompatible prerequisites produce an actionable blocked
result, not a pass.

Use a separate fixture package so the coroutine journey cannot replace the
existing Java/Kotlin fixture. Refuse installation if that package is already
present; remove only the package installed by this run. Run sequentially on an
explicit device serial. Initial target is emulator-5554; an attached Pixel 9 Pro
is a separate optional verification target, never selected automatically.

The fixture owns two named single-thread executor dispatchers. This makes a
thread change observable without relying on scheduler chance. A run exposes a
known local, suspends on a controllable gate, continues on the other dispatcher,
performs nested child work, then completes with a fixed visible result. A
separate cancellation run suspends a child, cancels and joins it, executes its
finally block and shows a cancellation result. Gates and UI state establish
ordering; arbitrary sleeps do not establish suspension. Close jobs/executors
on activity destruction. Use compiler-emitted line/class metadata to identify
generated continuation classes; do not assume every source line belongs to
MainActivity or has a usable breakpoint.

## Existing MCP workflow

Use `get_debugger_capabilities`, `attach_debugger`,
`set_debugger_breakpoint`, `wait_for_debugger_event`, `get_debugger_stack`,
`get_debugger_locals`, `step_debugger`, `resume_debugger`,
`remove_debugger_breakpoint`, `get_debugger_state` and `detach_debugger` with
their current inputs and response contracts in the [debugger guide](../../tools/debugger.md).
Keep session IDs, stop/thread/frame IDs and event cursors scoped to that run;
reject overflow as incomplete evidence. Inspect thread-based frames and shallow
locals without evaluating expressions or traversing continuation objects.

Verify source stops before and after suspension and across the dispatcher
change; compare known values with compiler scope tables. Report missing or
unavailable locals honestly. Compiler spilling into continuation fields does
not imply the locals API exposes those fields. Compare observed thread IDs and
stack locations, without calling a thread stack a logical coroutine stack.

Exercise into/over/out on a deterministic synchronous helper inside the coroutine.
Separately attempt a bounded step across a suspension boundary and record where
the event actually stops, including generated/runtime code or absence of a stop.
Do not require that step to follow the coroutine; remove the step request through
normal detach if it cannot make useful progress. A fresh session can then verify
the before/after source-breakpoint workaround independently.

## Safety, failure and cleanup

All stops suspend the app. Verify an MCP interaction is rejected with the existing
`DEBUGGER_PAUSED` result; no UI action is needed to release a gate while paused.
Resume before further input. Old stop/frame references must return
`DEBUGGER_STALE_REFERENCE` after execution resumes. Cancel an event wait and
confirm the session remains usable; distinguish MCP request cancellation from
fixture job cancellation.

Bound subprocesses and polls with explicit deadlines. Keep normal inspection
below the existing 60-second pause limit. On timeout, failure or interruption,
attempt bounded detach, close the client, remove only owned forwards/package
and temporary build output, and report unresolved cleanup. Never kill ADB,
unrelated debugger sessions or user apps, nor automatically retry uncertain
attach/step/resume operations. Preserve unrelated forwards. After normal detach,
use a fresh UI-tree assertion of the expected completion/cancellation text to
prove app recovery; detach acknowledgement alone is insufficient.

## Acceptance and assessment

1. A reproducible opt-in runner records source/APK/server fingerprints, dependency
   versions, Android target and per-journey pass/fail/blocked/unrun results.
2. Completion, cancellation, breakpoint workaround, stepping observations,
   stale references, pause guards, cancelled wait recovery and owned cleanup
   have explicit evidence. An unsupported debugging observation is an assessment
   finding; a failed safety or cleanup assertion remains a failure.
3. Emulator and physical-device evidence are separate. No physical run or
   version compatibility is inferred from emulator success.
4. Tool docs, usage skill and fixture README explain verified behaviour,
   limitations and reproduction. Existing journeys and `npm run verify` pass;
   applicable `npm run test:device` coverage and skips are reported.
5. A report recommends go/no-go for separately scoped inspection of active and
   suspended coroutine state, parent/child identity and logical stacks. Describe
   metadata/probe requirements and setup friction as evidence or open questions.
   No follow-up capability is implemented or approved by this specification.

Only synthetic fixture values are collected. Retain local evidence intentionally;
do not upload app data. Principal risks are compiler source mapping, ART variable
metadata and scheduler/debugger interaction. No live coroutine behaviour has been
verified yet. Prerequisite discovery found the proposed compiler/coroutine jars,
JDK 17 and an authorized emulator; this is availability evidence only.
