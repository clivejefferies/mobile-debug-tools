# iOS system traces — intent

- Source: [GitHub issue #78](https://github.com/clivejefferies/mobile-debug-tools/issues/78), authored by clivejefferies.
- Captured: 2026-11-04.
- Status: intent approved by the user's “ok” on 2026-11-04, responding to the
  complete scope and approval request in this chat. Specification approval pending.

## Problem and outcome

MCP clients need optional iOS performance evidence around an existing journey
to investigate slow interactions, hangs and rendering hitches. Add bounded
Apple Instruments capture through `xcrun xctrace` on macOS with Xcode, returning
a readable local `.trace` artifact with explicit iOS target/app metadata and
journey/evidence correlation identifiers.

## Scope and constraints

Investigate System Trace, Time Profiler, Hangs and Animation Hitches availability
and distinct coverage, then propose an initial supported target/template matrix.
Assess simulators and physical devices independently. Require explicit target
UDIDs, recording readiness before journey input, artifact validation, bounded
resource use, and cleanup of session-owned processes. Keep trace contents local,
explain sensitive-data and retention implications, and report setup/permission
failures without bypassing them. Reuse Android tracing conventions where suitable
and preserve existing Android and untraced-journey behaviour.

Success requires at least one development fixture completing start → asserted
journey → stop with a readable artifact and matching correlation metadata.
Report unsupported, blocked and unrun coverage separately.

Automatic diagnosis, performance summaries, arbitrary queries, general export
APIs and runtime debugging are excluded.

## Questions for investigation

Which target/template combinations are usable, how is recording readiness
established, and which fixture and export tables can prove useful capture?
These choices require specification approval after intent acceptance.
