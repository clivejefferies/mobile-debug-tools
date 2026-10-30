# Intent: Android runtime debugger

[Design and evidence](../../README.md#design-and-evidence) · [Tool reference](../../tools/TOOLS.md) · [Specification](spec.md) · [Plan and verification](plan.md)

Originator: clivejefferies, through GitHub roadmap issue #68 and maintainer design review.
Date: 2026-10-30. Status: approved.
Source: [issue #68](https://github.com/clivejefferies/mobile-debug-tools/issues/68), roadmap priority 5 of 9.

## Problem and outcome

MCP clients investigating incorrect Android app behaviour need runtime evidence
to test hypotheses: where execution stopped, how it got there, and the values
available at that point. Enable a bounded debugging session against an explicitly
selected debuggable app process on a specific Android device.

## Scope and success criteria

- Attach and detach, set source breakpoints, and report stop events.
- Inspect stacks and locals while paused; step and resume execution.
- Bind sessions to device/process identity and invalidate inspection references
  when execution resumes or the session ends.
- Coordinate UI actions and verification with known debugger pauses.
- Report unsupported configurations and setup/runtime failures explicitly.
- On detach or failure, clean up only session-owned resources and handle
  debugger-owned suspension explicitly.
- Verify the complete journey on a debuggable Android fixture.

## Exclusions and open decisions

Defer arbitrary expression evaluation, value mutation, coroutine reconstruction,
native debugging, iOS debugging, heap capture, and production-app enablement.

The ticket proposes an independently developed JDI worker. Specification must
validate that backend and establish prerequisites, MCP contracts, source/line
mapping limits, suspension policy, event delivery, timeouts, cancellation,
concurrency, crash recovery, privacy, and runnable fixture coverage.

## Approval

The user selected Android runtime debugger work with “ok, lets pick that up” and
approved the complete captured intent with “yes” on 2026-10-30 during design review. See the linked specification for its separate approval record.
