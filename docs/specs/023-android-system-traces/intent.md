# Intent: Android system traces

[Design and evidence](../../README.md#design-and-evidence) · [Tool reference](../../tools/TOOLS.md) · [Specification](spec.md) · [Plan and verification](plan.md)

Originator: repository maintainer, through GitHub roadmap issue #67.
Date: 2026-10-30. Status: approved.
Source: [issue #67](https://github.com/clivejefferies/mobile-debug-tools/issues/67), roadmap priority 4 of 9.

## Problem and outcome

MCP clients investigating slow or frozen Android interactions need system-level
performance evidence alongside existing journey and observation evidence.
The server currently has no system-trace capture capability.

Enable clients to start a bounded Android system trace, run an existing journey,
stop capture, and obtain a local Perfetto artifact with device, capture timing,
and correlation metadata. Detect available profiling capabilities explicitly and
report unsupported environments, failures, cancellation, and cleanup outcomes.

## Scope and success criteria

- Android capture around existing journeys, reusing established device targeting
  and correlated-evidence conventions.
- Optional profiling tooling with explicit capability and prerequisite reporting.
- Local artifact handling and bounded capture/resource ownership.
- Successful start/stop and artifact retrieval on a supported Android fixture.
- Explicit failure/cancellation outcomes and cleanup of session-owned resources.

## Exclusions and open decisions

Exclude iOS tracing, runtime debugging, heap dumps, automatic performance diagnosis,
and changes to journey interaction semantics. Do not upload trace contents.

Specification must establish the supported backend/tooling, tool contracts,
capture limits/configuration, concurrent-session rules, cancellation/recovery,
artifact retention, privacy handling, and verification prerequisites. The issue's
Android CLI integration is provisional and requires investigation.

## Approval

The maintainer approved the complete captured intent with “yes” during design review on 2026-10-30. See the linked specification for its separate approval record.
