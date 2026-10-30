# Intent: code structure and quality gates

[Documentation](../../README.md) · [Development process](../process.md)

Originator: repository maintainer. Date: 2026-10-30.
Status: approved on 2026-10-30.
Source: maintainer request to address oversized classes, weak type boundaries,
tight coupling, duplicated contracts, and dense lifecycle code, and add tooling
that prevents recurrence.

## Problem and outcome

The current lint configuration checks unused imports and variables, but has no
size, complexity, or type-safety gates. `ToolsInteract` combines target resolution,
control adjustment, waits, assertions, and shared state in about 3,700 lines.
Separately maintained schemas, handler types, and validation can drift. Static
method replacement makes tests depend on implementation details.

Make responsibilities easier to locate, change, and verify while preserving MCP
contracts, defaults, platform behaviour, cancellation, timing, and cleanup.

## Scope and success criteria

- Extract cohesive interaction services behind compatible public entrypoints.
- Replace unsafe types at extracted boundaries and introduce narrow dependency
  injection where it improves isolation.
- Reduce schema/type/validation duplication without changing accepted inputs.
- Make debugger lifecycle transitions and cleanup readable and explicitly typed.
- Enforce source file, class, function, complexity, nesting, and type-safety limits
  in local verification and CI. Define reviewed, narrow legacy exceptions that
  cannot grow silently; do not disable existing checks or hide new violations.
- Cover extracted behaviour and guardrail failures with deterministic tests;
  supplement with relevant device checks and record unavailable coverage.

## Boundaries and specification decisions

No new MCP capabilities, framework migration, public API redesign, or incidental
product fixes. Preserve current unrelated documentation edits and removals.
Specify thresholds, legacy-debt handling, module dependencies, extraction order,
contract parity checks, and verification before implementation. Do not treat code
size alone as proof of good design or split methods merely to satisfy metrics.

## Approval

The maintainer approved this captured problem and scope with “looks good” on
2026-10-30. Implementation requires a separately accepted
[specification](spec.md) under the development process.
