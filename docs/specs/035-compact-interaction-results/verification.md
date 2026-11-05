# Verification record — 2026-11-05

Implementation is local on feature/compact-interact-results, based on commit
04f082a4c03f20b64a8fb13aed2b155225cad6cc plus this ticket's working-tree changes.
Nothing was committed, pushed, published or installed as a released package.

## Automated checks

- `npm run verify`: PASS; ESLint, structural limits, architecture, TypeScript,
  108 unit-test files, and agent-plugin consistency.
- Focused compact tests: PASS; final serialized budgets, >=20% reduction for
  each baseline fixture, huge conditions/deltas, multibyte/control-character IDs,
  maximal 50-step results, retained diagnostics, automatic expiry, count/byte
  eviction, oversized rejection, session mismatch, concurrency and strict UUID
  schema, no replay, debug compatibility, guarded failures and MCP error signalling.
- Journey evidence regression: PASS; shared assertion observations attach to the
  preceding light tap; later actions invalidate both tap/assertion freshness before
  projection and diagnostics retention. Missing capture times remain unknown.
- Tool-definition compatibility fixture intentionally updated for the new tool and
  revised compact descriptions. Existing conditional, selector, debugger-guard,
  correlation and trace assertions now retrieve detailed metadata through diagnostics.
- Relative documentation links, whitespace/diff checks and plugin mirror: PASS.

Local runtime: Node v23.11.0; CI uses Node 22. CI additionally compiles the Java
worker and checks package contents; those CI-specific steps were not run locally.
No Java or packaging configuration was changed.

## Native evidence

`npm run test:device`: PASS on final retry; 16 test files loaded. Seven optional
fixture files reported UNRUN: Android coroutine/Kotlin/runtime debugger, iOS runtime
debugger, isolated Android interaction fixture, disposable-device readiness, and
iOS system trace. Their explicit environment variables/toolchain selections were
not supplied. This does not establish coverage for those journeys or physical devices.

The new compact smoke uses MCP stdio against rebuilt dist/server.js (server
0.36.0), rather than the connected older MCP instance. Settings was the starting
and ending app; no settings or app data were modified. Checks passed on:

| Platform/device | Observed evidence | Status |
| --- | --- | --- |
| Android 16, emulator-5554 | Dispatch-only launch unknown; light launch fresh post-action UI tree; absent selector fails before dispatch; two-step launch/assert journey; original/child lookup | PASS |
| iOS 26.4, iPhone 17 Pro simulator F9243BAF-62A8-4990-8A99-17F527F56FDA | Same structured checks, preserving unknown/unsupported iOS readiness signals | PASS |

These are UI-tree semantic/state checks, not screenshot layout assertions. The
older baseline screenshot established only the initial Settings layout.

Final fixture sizes were 830–864 bytes versus 1,106–1,639 baseline bytes (25–48%
reduction, timing-dependent by a few bytes). Token counts use ceil(bytes/4), not a
tokenizer. Device response sizes are recorded below after the final focused run.

The compact build hash is SHA-256
c2f93bf6a45b774f1fd2d57d721c855cb91e69f6ecbee46d860c12a00f2d151a,
computed over dist/server.js, dist/server/handlers/compact-interaction.js,
dist/server/handlers/compact-state.js,
dist/server/handlers/interaction-diagnostics.js, and dist/observe/evidence.js
in that order. This identifies a local build, not a release.

## Failure investigation and review

An earlier device-suite attempt found one Android trace-shutdown file-removal
failure. A complete unmodified HEAD trace smoke passed; the modified trace smoke
then passed in isolation and within the final full device suite. Root cause remains
unproven; no trace implementation or assertion was weakened. The exact task-owned
leftover file was removed after its capture duration elapsed and absence verified.
This intermittent failure is recorded rather than classified as pre-existing.

Focused review checked final projection after guards/correlation and journey
refresh, post-dispatch/same-device/freshness requirements, fixed outcome/blocker
preservation, optional-summary truncation, retained-original fidelity, strict lookup
validation, bounded memory/automatic expiry, and absence of replay/native work in
lookup. Debug payloads and execution controls remain compatible. Compact clients
must migrate detailed metadata reads to the new lookup. Diagnostics may expire or
be evicted and oversized entries are explicitly unavailable; this is documented.

Simulator shutdown and final focused build confirmation are recorded below.

## Final focused build run

| Platform | Dispatch-only bytes | Observed bytes | Blocked bytes | Journey bytes |
| --- | ---: | ---: | ---: | ---: |
| android | 839 | 972 | 952 | 2184 |
| ios | 893 | 1034 | 925 | 2284 |

Both platform journeys and original/child lookups passed on the final rebuilt
server. Android Settings remains foreground with no data/settings changes.
The iPhone 17 Pro simulator was shut down and booted-device inventory checked,
restoring its initial state.
