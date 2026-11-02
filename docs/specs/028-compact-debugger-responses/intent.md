# Intent: compact debugger responses

[Documentation](../../README.md) · [Development process](../process.md)

Originator: repository maintainer through GitHub issue #82.
Date: 2026-11-02. Status: approved.
Source: [issue #82](https://github.com/clivejefferies/mobile-debug-tools/issues/82),
priority 2 of 13, and the maintainer's request to pick up the next ticket.
GitHub Projects status could not be verified: the available token lacks
`read:project`. Selection follows the issue's published priority order.

## Problem and outcome

Debugger responses repeat target, capability and session metadata during long
investigations. Provide an opt-in compact mode for existing debugger tools so
MCP clients receive less repeated data while retaining everything required to
understand the result and safely continue debugging.

## Scope and success criteria

Preserve existing default responses and client compatibility. Compact responses
must retain operation results, continuation identifiers, execution state, errors,
uncertainty, truncation and unresolved cleanup. Keep actionable diagnostics from
issue #81 available in either mode; retain full responses on request.

Compare serialized output for the same attach → breakpoint → stop → stack →
locals → step → resume → detach journey, reporting measured savings without
inventing a reduction target. Verify success, failure, stale references and
incomplete cleanup, and document when clients need full responses.

## Boundaries and open decisions

Scope is response presentation for current debugger tools. Other tools, new
debugging capabilities, session lifecycle changes and iOS debugger implementation
are excluded. The specification will settle mode naming in line with existing
`compact`/`debug` conventions, tool coverage and exact field retention.

## Approval

The maintainer approved this intent with “yes” in this chat on 2026-11-02.
Specification acceptance remains a separate gate.
