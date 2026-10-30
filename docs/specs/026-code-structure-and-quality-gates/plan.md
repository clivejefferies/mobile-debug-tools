# Plan: code structure and quality gates

[Intent](intent.md) · [Specification](spec.md) · [Verification metadata](verification.json)

Status: complete — implementation and required local verification passed.
Additional environment coverage remains explicitly unrun below.
The maintainer approved the specification with “ok, lets do it” on 2026-10-30,
and subsequently requested the folder cleanup and ArchUnitTS trial.


## Implementation

- [x] Capture complete public tool definitions and existing structural metrics.
- [x] Add structural/type/boundary checks to lint and CI, with per-symbol legacy
  ceilings and rejection of growth, stale entries, duplicate identities and
  inline suppression. No baseline rewrite command runs in lint or CI.
- [x] Extract shared runtime action-result/trace helpers and selector/condition
  contracts, preserving server compatibility exports.
- [x] Extract typed element, control-value, geometry, label and UI-change helpers;
  bounded handle storage; injected subtree lookup and adjustment verification;
  adjustment planning/results; and readable-state comparison.
- [x] Complete the thin `ToolsInteract` facade: adjustment, resolution, polling,
  assertion and legacy wait orchestration now live in typed services meeting
  default limits without legacy exceptions. Existing handler/test seams remain.
- [x] Consolidate clock/delay dependencies across interaction polling services;
  production timer and readiness-budget semantics remain intact, with deterministic
  injected-clock coverage for stability, retries, deadlines and trace timestamps.
- [x] Split typed tool definitions by capability and retain exact registration order.
- [x] Split server handler orchestration by capability and separate action
  dispatch, conditional rejection, verification, evidence and journey phases.
- [x] Share target-selection and execution-control contracts across TypeScript,
  runtime validation and public schemas without changing permissive legacy parsing.
- [x] Organise interaction helpers by responsibility and place network
  observations under `observe/network/`.
- [x] Add the explicitly approved ArchUnitTS development checks, including
  negative controls for dynamic imports, re-exports, aliases and runtime cycles.
- [x] Type debugger session/event/result boundaries, validate worker messages and
  separate command targeting, execution and error recovery. The refactored
  session manager meets default limits without exceptions.
- [x] Add quality-gate failure cases, public contract baseline, and focused
  helper/injection/protocol compatibility tests.
- [x] Document limits, ownership and exception review; verify this checkpoint.

## First-stage verification — 2026-10-30

| Criterion | Check | Result |
| --- | --- | --- |
| Contract parity | Complete before/after definitions and checked-in compatibility fixture | **Pass**: all 52 tool definitions, schemas, defaults, descriptions and order unchanged |
| Gate correctness | Size, complexity, nesting, types, boundaries, suppression and baseline fixtures | **Pass**: includes move/rename rejection, type-declaration isolation, obsolete entries and reductions |
| Interaction compatibility | Existing interaction/server tests plus helper, scope, state-comparison and injected-verification tests | **Pass** for extracted behaviour; remaining orchestration refactor is pending |
| Debugger lifecycle | Session/native/guard/protocol unit tests | **Pass**: serialization, stop references, event concurrency, expiry boundaries and cleanup |
| Maintainer checks | `npm run verify` | **Pass**: lint, quality gate, build, 78 unit files and plugin consistency on Node 23.11.0 |
| Native suite | `MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device` | **Pass**: 9 device files; Android debugger fixture, Android/iOS observation and correlation, Android Perfetto journeys |
| Java/package | `javac --release 17 --add-modules jdk.jdi`; built worker preparation; `npm pack --dry-run --json` | **Pass**: shell Java 23; package includes worker source, protocol, runtime and definition modules |
| Docs | Relative links/anchors, JSON and whitespace checks | **Pass** |

The first device attempt failed before app interaction because the test's build
fingerprint still referenced the removed `worker/` directory. Updated that
fingerprint to `src/debugger/java/`; the complete rerun passed without weakening
assertions or changing fixture behaviour.

Android debugger evidence uses emulator-5554, API 36, server 0.34.0 over MCP
stdio. It covers explicit attach, exact source stops, stack/known locals,
into/over/out, stale references, resume with UI evidence, paused-operation guards,
detach and forwarding ownership. Its complete dist/Java fingerprint is in the
linked metadata. The fixture and owned resources were removed. The optional
60-second expiry extension was **unrun**; deterministic expiry checks passed.

Correlation journeys pin the Android emulator and the iPhone 17 Pro simulator
(iOS 26.4). They launch Settings, capture referenced screenshots/logs/trees and
check freshness and unavailable references. No settings or app data changed;
Settings remains foreground. Older standalone observation wrappers use automatic
target selection; their results do not establish which physical device was read.
Perfetto checks pin the emulator and remove device/host trace artifacts.

Real-device adjustable-control convergence is **unrun**: the current automated
fixtures do not provide that journey. Adjustment behaviour has existing mock-
adapter coverage and new injected-verification tests. Physical-device debugger,
local Node 18, JDK 17 runtime execution, and hosted CI remain **unrun**. Existing
CI retains Node 18 and Java 17; successful local checks do not establish hosted
results or installed/published-package behaviour.

## ToolsInteract continuation — 2026-10-30

The maintainer requested continuing until the class met the 300-line limit.
The class now contains **189 counted lines**, in a 267-line file, with no legacy
exceptions. All 41 refactored interaction modules meet default file, function,
complexity, nesting, type and dependency rules. A permanent unit check rejects
exceptions for these modules, including future nested directories.

The facade composes observation and input dependencies and preserves existing
entrypoints. Adjustment stages cover resolution, planning, semantic strategies,
coordinate/gesture fallback and verification. Candidate search separates scoring,
ancestor preference and result construction. UI waits and assertions separate
state, observation, stability and result handling. Legacy wait modes retain their
baseline collection, polling and failure-snapshot behaviour.

| Check | Result |
| --- | --- |
| `npm run verify` | **Pass**: lint, quality gate, build, 81 unit files, plugin consistency |
| Default interaction budgets | **Pass**: 41 modules; no interaction-facade/service exceptions |
| Public tool definitions | **Pass**: all 52 definitions unchanged against the captured fixture |
| Native suite | **Pass**: 10 device files, including the new interaction journey |
| Package dry run | **Pass**: Java source and all runtime/service modules included |
| Documentation/JSON/whitespace | **Pass** |

[Continuation verification metadata](verification-thin-facade.json) records native
results and their build identities. Android API 36 emulator verification through
the built MCP server covers clickable waits, resolved-handle taps, selector taps,
visible assertions and stable enabled-state assertions on the isolated fixture.
Fresh hierarchy assertions establish Result 43 and enabled=true; dispatch alone
is not used as success evidence. The fixture is removed in `finally`, and the
suite subsequently leaves system Settings foreground. Debugger, Android/iOS
observation/correlation and Android trace journeys also pass. General older
observation wrappers still use automatic device targeting.

The earlier [verification record](verification.json) is retained for the first
checkpoint. At that point the class was 2,161 counted lines; it is superseded by
the current facade result above. Legacy exceptions elsewhere fell from 205 to
162 without transferring exceptions to extracted code. Real-device adjustable
control convergence and interactive iOS navigation remain **unrun**; existing
mock/native-adapter and injected-strategy tests establish those covered contracts,
not device outcomes. Hosted CI, local Node 18 and physical-device journeys remain
separate from the passing local/emulator checks.

## Final implementation continuation — 2026-10-30

The central server handler is now a 159-line registration/dispatch module.
Capability handlers cover management, observations, interactions, input, journeys
and diagnostics. Action execution separates budgeted delivery, conditional
rejection, result normalization, verification and serialization. Journey execution
separates assertions, step dispatch, shared light-verification evidence, compact
results and final response construction. These modules meet default quality limits
without exceptions; 26 obsolete server allowances were removed, leaving 136
reviewed legacy allowances elsewhere.

Target fields, mutually exclusive target validation, wait controls and execution
modes now have shared contracts. Existing legacy argument readers and control
clamping/error semantics are retained. The complete 52-tool compatibility fixture
still passes. Interaction services receive optional clocks; default composition
uses the existing wall clock and delays, including readiness-aware budget delays.
No process-global clock replacement is required by the new timing tests.

The Android fixture now contains a labelled SeekBar, closing the adjustable-control
convergence coverage gap. The updated journey has passed convergence and a fresh
hierarchy assertion for the displayed value. Final checks and their results
are recorded in [final verification metadata](verification-final.json).

Earlier verification tables and metadata are dated checkpoints; they do not
represent the final source layout or coverage. No commit, push, release or
publication was performed. Existing unrelated edits and user removals were
preserved.

### Final verification results

| Check | Result |
| --- | --- |
| `npm run verify` on Node 18.20.8 | **Pass**: lint, structural and architecture gates, build, 83 unit files and plugin consistency |
| `npm run test:device` on Node 23.11.0 | **Pass**: all 10 device files; Android debugger, selector/wait/assertion/adjustment journeys, Android/iOS observation and correlation, Android Perfetto |
| Public contract fixture | **Pass**: all 52 definitions unchanged |
| Worker Java compilation | **Pass**: `javac --release 17 --add-modules jdk.jdi` on Java 23 |
| Package dry run | **Pass**: all 121 compiled TypeScript modules and Java worker source included |
| Documentation and whitespace | **Pass**: relative links/anchors, metadata JSON and diff checks |

The final complete dist/Java build fingerprint is
`2791c7ff502e7e60c9e053307ffb8afe3ad100afcbb4a7e68df5c85efa8d3041`.
Trace-specific fingerprints cover a different subset of modules and are retained
in the metadata as separate records. The Android interaction fixture starts at
25 and verifies adjustment toward 75 within tolerance 5, followed by a fresh
hierarchy assertion of the displayed value. Both fixture journeys remove their
owned app/build data; Perfetto removes owned traces and host artifacts. System
Settings remains foreground after observation checks without settings changes.

Review identified and corrected an asynchronous error-handling difference while
extracting debugger guards. A regression test now verifies that device-resolution
failures retain the existing MCP error envelope. The final full Node 18 and native
runs were repeated after that correction; the fingerprint above matches the final
build.

Hosted CI, physical-device interaction/debugger journeys, interactive iOS
navigation/state/adjustment, the optional extended debugger expiry device journey,
and execution under a JDK 17 runtime remain **unrun**. The metadata records the
scope and reason for each. These are additional environment coverage limits,
not passing device evidence or remaining implementation tasks. Local Node 18 and
Android adjustable-control convergence are now verified, superseding those
unrun entries in earlier checkpoints.

## Follow-on maintenance

See the [codebase health cleanup](health-plan.md) for subsequent debt removal,
Node 22 support and verification. The results above describe the original change.
