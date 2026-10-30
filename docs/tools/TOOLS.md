# Tool reference

[Documentation](../README.md)

Start with [Getting started](../../README.md#getting-started) for a complete interaction.
Use the guides below when you need a tool contract or a specific workflow.

## Reference guides

- [App management](manage.md) — build, install, launch, restart, and device management.
- [Observation](observe.md) — screenshots, logs, UI trees, fingerprints, debug snapshots, and app readiness.
- [Interaction](interact.md) — UI resolution, actions, waits, and deterministic verification.
- [Environment diagnostics](system.md) — toolchain discovery and health checks.
- [Evidence correlation](correlated-evidence.md) — action references, capture timing, and freshness.
- [Android system traces](system-traces.md) — performance capture and local Perfetto artifacts.
- [Android runtime debugger](debugger.md) — process attachment, breakpoints, and bounded runtime inspection.

## Interaction principles

Interactive flows follow a common sequence:

**RESOLVE → ACT → WAIT (if needed) → EXPECT**

- Resolution identifies the target before an action.
- Actions report execution; successful dispatch alone does not establish the intended outcome.
- `wait_for_*` tools resolve targets and synchronize with UI changes.
- `expect_*` tools verify the final outcome using explicit assertions.
- Observation tools provide evidence for targeting, assertions, and diagnosis; collecting evidence alone does not establish success.
- `get_system_status` identifies available toolchains and missing prerequisites before environment-sensitive operations. Explicit tool paths override automatic discovery when needed.

## Reading examples

Inputs are MCP tool arguments, not shell commands. Replace example device IDs,
app identifiers, and UI labels with values from your environment. Response
examples show relevant fields and may omit optional metadata, execution traces,
and [evidence correlation](correlated-evidence.md). Clients receive JSON in MCP
text content blocks, with additional image blocks for screenshot tools.

Parameter spelling varies by tool: for example, standalone UI waits use
`timeout_ms`, while journeys and readiness tools use `timeoutMs`. Follow the
individual tool's input contract rather than translating names between tools.
