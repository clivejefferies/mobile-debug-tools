# Tools index

This repository groups the MCP tools into four areas aligned with the codebase:

- [manage](manage.md) — build, install, launch, restart, and device-management tools
- [observe](observe.md) — screenshots, logs, UI trees, fingerprints, and debug snapshots
- [interact](interact.md) — UI resolution, actions, waits, and deterministic verification
- [system](system.md) — environment and health checks

## Agent guidance

For interactive flows, the intended deterministic pattern is:

**RESOLVE -> ACT -> WAIT (if needed) -> EXPECT**

- **wait_for_\*** tools are for resolution and synchronization
- **expect_\*** tools are for final outcome verification
- observation tools are supporting context, not primary success signals

Use the linked documents below for per-tool inputs, outputs, and usage guidance.
