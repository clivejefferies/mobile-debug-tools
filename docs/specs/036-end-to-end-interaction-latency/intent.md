# End-to-end interaction latency — intent

Status: accepted on 2026-11-06. The user replied “ok” to the proposed intent
and its scope in this chat. This approves investigation and specification;
specification acceptance is still required before implementation.
Originator: Clive Jefferies, GitHub issue #100; picked up at the user's request on 2026-11-06.
Source: https://github.com/clivejefferies/mobile-debug-tools/issues/100

## Problem and outcome

Agent feedback reports observations taking several seconds during small UI
refinements. Establish reproducible measurements of complete MCP action and
observation round trips, separating MCP overhead from Gradle builds, application
work, and external test-suite time. Optimize only bottlenecks supported by those
measurements; a documented negative finding is a valid outcome.

## Scope and success

Reuse the existing interaction-latency benchmark and coordinate iOS UI-tree
measurements with issue #89 and its existing fixture. Measure Android and iOS
separately and compare relevant response and verification modes. Report repeated
runs, p50/p95, failed attempts, device/platform, server build, tool versions, and
component costs: targeting/readiness, subprocess acquisition, screenshots, UI
trees, waits, verification, and serialization. Identify attribution limits.

Any proposed optimization must improve the same baseline while preserving fresh,
device-scoped evidence, assertions, required verification, deadlines,
cancellation, and child-process cleanup. Report unavailable platform coverage
explicitly. Existing MCP clients must retain their agreed contracts.

## Constraints and open questions

No speculative caching, hidden failures, reduced verification, or duplicated iOS
tree fixture. Runtime or contract changes require an accepted specification.
Investigation will establish available devices, reproducible workloads, useful
sample counts, and existing timing coverage before specification. No performance
target or optimization is assumed in advance.
