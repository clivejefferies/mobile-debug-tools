# Plan: Android runtime debugger

[Design and evidence](../../README.md#design-and-evidence) · [Tool reference](../../tools/TOOLS.md) · [Intent](intent.md) · [Specification](spec.md)

2026-10-30. [Intent](intent.md) and [spec](spec.md) explicitly approved by the
user's successive “yes” responses during design review. Implementation authorized.

## Implementation

- [x] Build optional JDK 17+ worker compilation/cache and bounded JSON-lines client.
- [x] Implement JDI attach, breakpoint events, bounded inspection, step/resume,
  reference epochs, expiry and owned cleanup.
- [x] Implement explicit Android process identity/JDWP targeting and owned forwarding.
- [x] Register strict MCP contracts and serialize session transitions.
- [x] Integrate pause evidence, dispatch/wait/lifecycle guards and shutdown.
- [x] Add isolated debuggable fixture, regression tests and native journeys.
- [x] Align capabilities, packaging, tools, README and changelog; review consistency.

## Verification

| Criteria | Checks |
| --- | --- |
| Explicit targeting/unsupported/ambiguity | Native adapter tests; emulator fixture attach and capability calls |
| Breakpoints/stacks/locals/steps | Real Android fixture through built MCP stdio; no separate JVM debuggee required |
| Stale references/bounds/metadata | Unit contract checks plus Android stale inspection, bounded locals and source metadata checks |
| UI pause and races | Guard/readiness unit checks; paused fixture action, wait and journey; resumed UI assertion |
| Detach/failure/expiry/ownership | Unit worker/session tests, native disconnect and forward comparison |
| Packaging/compatibility | npm pack --dry-run; npm run verify; worker compile --release 17 |
| Existing runtime | npm run test:device; inspect actual platform coverage |

Prerequisites: Node >=18, JDK >=17 with javac/jdk.jdi; Android SDK platform/build-tools
36 for fixture, platform-tools. Host currently Java 23/ADB 37.0.1; emulator-5554
API 36 arm64 online outside sandbox. Existing CI: Node 18, manual Android JDK17/API30.
Use separate dev.mobiledebugmcp.debugfixture app with javac -g. Capture source-line
and known-local evidence; remove fixture, temporary outputs and owned forwards.
Physical device and iOS debugger verification are not required by this Android
scope; report them unrun/unsupported. Never treat readiness probes as debug proof.

## Results

Implemented and reviewed locally. No commit, push, release or hosted CI run performed.

- **PASS** `npm run verify`: lint, TypeScript build, all self-running unit tests,
  agent-plugin consistency. Focused debugger tests cover schema strictness,
  identity/PID reuse, exact-forward ownership, event wait concurrency/overflow,
  stale stops, inspection versus mutation timeout policy, worker failure,
  cleanup retry, no-read paused readiness and mid-journey preservation.
- **PASS** `npm run test:device`: existing Android/iOS screenshot, log, hierarchy
  and correlated-evidence smoke checks; Android Perfetto journeys. The debugger
  case reports **UNRUN** without its explicit device environment variable and is
  independently verified below. Generic observations do not prove iOS debugging.
- **PASS** `MCP_DEBUGGER_DEVICE=emulator-5554 npx tsx test/device/automated/debugger/runtime.android.test.ts`:
  built server 0.33.0 over actual MCP stdio; Node 23.11.0, worker JBR 25.0.3,
  API 36/Android 16 arm64 emulator. Final full dist/worker fingerprint:
  `5281d7127822e83355f6be1fcf81555827a078839364fb5115d4644d63d6048d`.
  Isolated fixture starts at Ready; explicit attach, correct source breakpoint,
  known local 42, 256-character string truncation and shallow object identity pass.
  A separately compiled fixture with no local-variable tables establishes explicit
  ART metadata uncertainty rather than an inferred empty scope. Removed pending
  breakpoints remain removed when another request prepares the same class.
  Into/over/out, stale frame rejection and resume pass; a fresh UI tree establishes
  Result 43. Pending class resolves and stops; invalid line is rejected. Capability
  deadline and missing app outcomes are explicit. Paused input/wait/lifecycle/journey
  calls block; MCP event-wait cancellation leaves the stop intact. Reattach after
  detach and process-exit cleanup pass. Closing MCP while actively paused removes
  the owned forward; an independent fresh server observes Result 43 afterward.
  Fixture package, temporary outputs and owned forwards are removed; pre-existing
  forwards and device display settings are preserved.
- **PASS** extended stdio journey with `MCP_DEBUGGER_EXTENDED=1`: real 60-second
  continuous-pause expiry despite repeated client polling, with complete owned
  cleanup. Core-build fingerprint at that earlier checkpoint:
  `76c0937b01aa296839783651bd9f445b0a1855f3e5416a4f3d41cf8a04a4757d`.
  Later bounded-memory/heartbeat changes are covered by the final native journey;
  pause-limit logic was unchanged. This earlier hash covers the named debugger
  modules/worker, unlike the final complete dist/worker fingerprint.
- **PASS** standalone `javac --release 17 --add-modules jdk.jdi` compilation;
  `npm pack --dry-run --json` includes worker source and built debugger/schema modules.
  CI YAML parses; unit CI now compiles the worker on JDK 17 and checks packaging;
  manual Android CI installs fixture SDK prerequisites and selects its emulator.
  Hosted CI and JDK 17 runtime execution remain **UNRUN** locally.

Focused review corrected bounded JDWP subscription discovery, integer IPC,
terminal-state/cleanup races, import-order coupling, MCP stdout diagnostic leakage,
mutation cancellation/deadlines, device-specific guards, and event-poll activity
accounting, removed pending-breakpoint rebinding, per-location code-index identity,
and ART empty-table uncertainty. Test fixture content was moved below Android edge-to-edge system bars.

Remaining limits: physical-device debugging, API 30 CI execution, Windows/Linux
native runtime, Kotlin-specific metadata, and concurrent class-loader breakpoint
variants are **UNRUN**. ART empty/absent-variable metadata ambiguity is native-verified; the distinct JDI
AbsentInformationException path is code-inspected.
String truncation is native-verified; multi-device/race paths have unit coverage,
not exhaustive native coverage. Real
five-minute idle and 30-minute total expiry have not been wall-clock exercised;
all host expiry boundaries have deterministic unit checks;
the real pause expiry has. iOS/native/evaluation/mutation/coroutine debugging are
excluded. Abrupt host loss cannot guarantee confirmed device resumption.


Verification note: one late full run failed the unchanged conditional-action
150 ms action-budget assertion (`condition read does not consume the action
budget`). The focused test passed unchanged on both the current implementation
and an isolated HEAD archive; this does not prove the intermittent failure
predates this change. The final full `npm run verify` run passed in isolation, including the unchanged
conditional-action test. No timeout,
assertion, validation rule or test selection was weakened.
