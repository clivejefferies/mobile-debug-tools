# iOS runtime debugger — specification

Source: [issue #70](https://github.com/clivejefferies/mobile-debug-tools/issues/70).
Scope: [accepted intent](intent.md), approved by the user's “ok” on 2026-11-04.
Status: **approved** by the user's “ok” on 2026-11-04 in response to the complete
specification and approval request in this chat. Implementation authorised.

## Behaviour and supported environment

Add optional LLDB-backed debugging for an already-running development app on an
explicit iOS simulator UDID, on macOS with full Xcode and its Swift-enabled LLDB.
Initial verification targets the installed Xcode 27.2, LLDB 2103.0.34.407 and Swift
6.4.2 toolchain; other versions remain unverified until separately exercised.
Physical devices, remote hosts and production/optimised apps are unsupported in
this initial matrix. Normal mobile tools must not acquire an LLDB dependency.

Provide source breakpoints, stop events, bounded stacks and shallow locals,
into/over/out stepping, resume and detach through the existing eleven tools.
Attach may briefly stop the process for setup, but returns running unless an
actual stop event has been retained; never discard a racing breakpoint stop.
LLDB stops suspend the target process, not the whole simulator.

## Tool contract and compatibility

Extend `get_debugger_capabilities` and `attach_debugger` to accept
`platform: "android" | "ios"`, existing explicit `deviceId`, `appId` and optional
positive `processId`. For iOS, require a simulator UDID and valid bundle identifier.
Probe without attaching or launching the app. Report missing prerequisites,
unsupported target types, absent apps/processes and ambiguous candidates
explicitly. A probe cannot guarantee that later attach permission will succeed.

Preserve all existing Android requests. Extend `set_debugger_breakpoint` with
optional `sourceFile` (nonempty absolute local source path, maximum 512 characters).
Require exactly one of `className` or `sourceFile`, with the existing positive
1-based `line`. Android sessions require `className`; iOS sessions require
`sourceFile`. Invalid combinations fail `INVALID_ARGUMENT`. Resolve the full
path against loaded debug information, never a basename fallback or shell search.
Return owned breakpoint ID, pending/resolved/rejected status and actual locations.
Unloaded images can remain pending. Only exact executable line matches may be
enabled; locations silently moved by LLDB are rejected and removed.

Keep session, stop, thread and frame arguments, tool names, response modes,
pagination, defaults and timeout bounds unchanged. Existing common response and
error shapes remain: `success`, session/target/device metadata, state, timestamp,
capabilities, limitations, cleanup, reason, stop, operation `result`, and sanitized
`error: {code, message, retryable, diagnostic?}`. Device platform is correct on
success and failure. iOS target metadata carries bundle ID, PID, executable name,
process-start identity and nullable UID; Android retains its existing fields.

Capability values are backend-specific. iOS advertises supported core operations;
`evaluation`, `mutation`, `coroutines` and `native` remain false (`native` denotes
an exposed native-specific inspection capability, not LLDB's implementation).
Add iOS-only boolean `async_execution_inspection` and `async_stepping`; the former
requires the async acceptance journey below, the latter a separate demonstrated
step across suspension. False values carry explanatory limitations. No suspended
task enumeration, task identity API or logical-task reconstruction is promised.
Preserve compact mode's existing omissions and full attach/capabilities/state
responses. Unknown fields remain rejected.

## Async semantics

Source breakpoints must work before and after a controlled Swift `await`, with
useful known primitive locals at each actual stop. Include nested child work,
actor/executor transitions and a separately triggered task cancellation path.
Use deterministic fixture gates and completion/cancellation UI state.

Stepping acknowledges delivery and resumes; only a subsequent event establishes
where execution stopped. Exercise ordinary helper into/over/out and an `await`
boundary. Delegate stepping to Swift-enabled LLDB; do not equate a physical
thread ID with stable task identity. If the tested LLDB route follows the async
continuation, report the observed source stop and advertise `async_stepping`.
Otherwise report it false with the limitation and demonstrate recovery through
independent after-await breakpoints. Unexpected missing async locals or source
stops fail core async acceptance rather than being labelled support.

Stacks describe LLDB's observed frames; label unavailable source/variable data
and generated frames honestly. Do not claim a complete logical async ancestry.
No expression evaluation, object descriptions, custom formatters that execute
code, property getters, dynamic method calls or continuation-field traversal.

## Ownership, failure and safety

Resolve simulator, bundle executable and running PID together; validate executable
path, start identity and simulator membership before and after attach. Never attach
to an arbitrary host PID, launch a missing app or replace another debugger.
Reject identity changes and duplicate owned sessions. Serialize session mutations;
isolate sessions and guards by platform plus device, including identical IDs.

Reuse stop-scoped opaque references, the 256-event ring/100-event response limit,
1000-frame cap, default 20/max 100 stack page, max 100 locals and 256-character
string bound. Object locals expose type/opaque identity only. Missing or
inaccessible variables are explicit; an empty list cannot prove availability.

Generalise pause guards/readiness to iOS lifecycle actions, input, waits and
assertions. Preserve device-wide conservative guarding, racing-dispatch
uncertainty and observation access within existing deadlines. Do not claim
foreground identity from debugger state.

Use a dedicated owned LLDB worker with bounded structured IPC, argument-array
subprocess calls, disabled user init files and no arbitrary command interface.
Sanitize errors using the existing bounded diagnostic catalog; iOS recovery
guidance names Xcode/LLDB rather than JDK/ADB. Never log worker messages, locals,
raw stderr, exception text or source contents. Debug inspection stays local and
request-scoped; public evidence uses only the disposable fixture.

Retain 100–30000 ms request bounds, 60-second pause, five-minute idle and
30-minute session expiry, including independent worker watchdogs. Event-wait
cancellation preserves a usable session. Inspection timeouts preserve a known
session; uncertain attach or mutation outcomes trigger owned teardown and report
execution uncertainty. No automatic retries of attach/step/resume.

Detach releases owned suspension, breakpoints, step plans and worker resources;
never kill the app, another debugger or simulator. EOF/shutdown/expiry attempt
detach. Cleanup is idempotent and retryable with explicit remaining resources;
transport loss or forced host termination cannot imply confirmed recovery.

## Acceptance and verification

1. Real MCP simulator journey: attach, exact and pending source breakpoint,
   stop, source stack, known locals, helper stepping, resume, removal and detach.
2. Async journey: before/after-await locals, nested work and executor transition,
   completion, cancellation recovery, and recorded boundary-step outcome.
3. Safety: stale references, cross-session/device isolation, paused input and
   readiness, cancelled event wait, process exit, attach failure, timeout,
   automatic expiry and repeatable cleanup. Verify app usability after detach.
4. Contract checks cover registration, runtime validation, dispatch, both response
   modes, diagnostics and Android compatibility. Run `npm run verify`, applicable
   `npm run test:device`, focused iOS MCP journeys and Android debugger regressions.
5. Record fixture/server hashes, Xcode/LLDB/Swift/runtime versions, target UDID,
   exact actions, observed values and independent UI-tree assertions. Report
   physical-device and unavailable coverage as unrun, never inferred.

Likely affected areas: `src/debugger/`, debugger schemas/handlers/serialization,
iOS interaction/readiness boundaries, fixture/device/unit trees, packaging and
debugger tool documentation/README/changelog. Reuse worker/session abstractions
without routing Android through LLDB. Main risks are simulator process attribution,
LLDB/Python distribution, async metadata, source relocation and teardown races.

## Investigation evidence and remaining prerequisites

On 2026-11-04, local version probes found the toolchain above. Sandboxed simctl
could not contact CoreSimulator; an authorised outside-sandbox read succeeded and
found no booted simulators. No existing iOS debugger implementation or live iOS
debug journey is claimed. Implementation verification requires booting an
available simulator and installing only the disposable development fixture.

Apple documents async-aware stepping since Swift 6.2 in
[What's new in Swift](https://developer.apple.com/videos/play/wwdc2025/245/).
The [LLDB SBFrame API](https://lldb.llvm.org/python_reference/lldb.SBFrame-class.html)
provides frame-variable access. These support the proposed route, not proof of
this server's behaviour; exact worker loading, attach and safe variable extraction
must be validated before claiming support. If unavailable, record the concrete
blocker and return for a scope decision rather than weakening acceptance.
