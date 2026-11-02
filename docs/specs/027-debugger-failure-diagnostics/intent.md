# Intent: debugger failure diagnostics

[Documentation](../../README.md) · [Development process](../process.md)

Originator: repository maintainer through GitHub issue #81.
Date: 2026-11-02. Status: approved.
Source: [issue #81](https://github.com/clivejefferies/mobile-debug-tools/issues/81),
current roadmap priority 1 of 13; maintainer request to pick up the next ticket.

## Problem and outcome

Intermittent `DEBUGGER_WORKER_FAILED` responses do not give MCP clients enough
evidence to distinguish worker startup, compilation, IPC/protocol, JDI attach,
and transport failures. Issue #80 did not reproduce on retest; this work improves
diagnosis without claiming to fix its unknown cause.

Give Android debugger clients bounded, sanitized failure classification and
actionable recovery guidance. Identify the stage and safe reason only where
evidence supports them, retaining explicit uncertainty otherwise.

## Scope and success criteria

Preserve existing error codes, successful operations, session ownership and
cleanup. Specify compatible additive diagnostics before implementation. Never
expose raw stderr, environment secrets, app locals or unbounded exception text
in MCP responses or logs.

Verify startup/process failure, malformed IPC, attach failure and
timeout/cancellation with deterministic regression checks and cleanup assertions.
Retain a verified Android attach/inspect/detach journey and document diagnostic
fields and limitations. Report unavailable device coverage explicitly.

## Boundaries and open decisions

No compact-response redesign, arbitrary evaluation, new debugging capability,
or implementation of iOS debugging. Keep the design reusable for later iOS work
without promising platform parity. The specification will settle diagnostic
fields, classification evidence, bounded output and recovery guidance.

## Approval

The maintainer approved the captured intent and scope with “looks good” in this
chat on 2026-11-02. Specification acceptance remains a separate gate.
