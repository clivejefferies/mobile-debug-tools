# Android coroutine debugger validation — issue #93

Date: 2026-11-02. Originator: repository maintainer, through
[issue #93](https://github.com/clivejefferies/mobile-debug-tools/issues/93).
Status: intent accepted. The maintainer replied “ok” on 2026-11-02 to the
proposed scope in this chat. This approves investigation and specification of
the bounded fixture assessment; the specification was subsequently accepted by a second “ok”.

## Problem and outcome

The Android JDI debugger exposes executing threads. Existing Kotlin validation
establishes ordinary named locals, but does not establish behaviour across
coroutine suspension, dispatcher changes or generated state machines. MCP clients
need evidence of which existing debugger operations remain useful and where
thread-based inspection stops representing a coroutine's logical execution.

Validate an isolated debuggable Kotlin fixture with known values before and
after suspension, a dispatcher/thread change, nested work, cancellation and
completion. Exercise existing attach, breakpoints, events, stacks, locals,
stepping, resume and detach. Record source/compiler/runtime correspondence,
stale-reference rejection, pause guards, app recovery and owned-resource cleanup.
Evaluate before/after breakpoints as a workaround without claiming stepping
follows a coroutine across threads. Report emulator and physical-device evidence
separately, including blocked and unrun paths.

## Boundaries and decisions

Deliver reproducible fixture checks, a supported-behaviour report, documentation
and a go/no-go recommendation for separately designed coroutine inspection.
No new MCP capability, automatic debug probes, arbitrary evaluation or
coroutine-following stepping is authorised by this assessment. Any reproduced
runtime defect or proposed capability follows the shared development process.

The specification must select coroutine/compiler versions and explicit fixture
dependencies, define deterministic stop points and cancellation outcomes, and
identify available targets. Full coroutine reconstruction must not delay iOS
parity.

## Initial investigation

- The existing Kotlin fixture tests synchronous calculation only; its current
  build helper packages the Kotlin standard library but no coroutine runtime.
- Reuse existing disposable-fixture and MCP device-test conventions. The
  ordinary Kotlin journey must retain its current behaviour.
- The earlier [Kotlin report](../029-kotlin-locals-validation/report.md) records
  emulator evidence; it does not establish coroutine or physical-device support.
- No coroutine implementation or device verification has run for this ticket.
