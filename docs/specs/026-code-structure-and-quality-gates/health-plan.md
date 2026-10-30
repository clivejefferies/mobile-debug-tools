# Follow-on codebase health cleanup

[Completed structural refactor](plan.md) · [Quality and ownership](../../code-structure.md)

Status: complete. Source: the maintainer requested fixing the remaining code
and dependency debt identified in the health review, excluding additional
verification-environment coverage (point 4). This is behaviour-preserving
maintenance under the shared process. On 2026-10-30 the maintainer explicitly
approved raising the minimum runtime to Node 22 to permit patched dependencies.

## Scope

- [x] Triage the 20 dependency audit findings and update compatible dependencies.
- [x] Upgrade Sharp and Zod, preserve complete public tool-definition parity,
  and clear the remaining tsx/esbuild advisory.
- [x] Update the declared runtime and CI configuration to Node 22.
- [x] Replace the oversized Android/iOS observation classes with cohesive services.
- [x] Decompose snapshot collection, normalization and semantic summary generation.
- [x] Decompose iOS build discovery, command preparation, execution and diagnostics.
- [x] Reduce environment diagnostics complexity and remaining unsafe boundaries.
- [x] Remove resolved legacy exceptions without moving or enlarging allowances.
- [x] Run focused regressions, complete verification on Node 22, and relevant
  existing device checks; record results and cleanup.

The initial baseline contained 136 exceptions; it is now empty. Existing exported entrypoints,
response shapes, schema strictness, retry order, deadlines, resource ownership and
error behaviour must remain compatible. In particular, retain platform-specific
screenshot alpha/fallback policy and concurrent snapshot acquisition behaviour.

Additional hosted CI, physical-device journeys and new interactive iOS coverage
remain outside this request. Existing runnable regression checks still apply to
changed code. No commit, push, package publication or plugin pin change is implied.

## Verification

Local runtime: Node v22.23.4. Verification took place on 2026-10-30.

| Check | Result |
| --- | --- |
| `npm run verify` under Node 22 | **Pass**: lint, quality, four architecture rules, build, 85 unit files and plugin consistency |
| Complete public tool-definition fixture | **Pass**: all 52 definitions retain their existing shapes and defaults |
| Screenshot encoding regressions | **Pass**: Android/iOS transparency policy, fallback formats and conversion failure |
| Snapshot log regressions | **Pass**: numeric/string timestamps, stream precedence and severity normalization |
| `npm audit --json` | **Pass**: 20 findings reduced to zero, including development dependencies |
| `npm pack --dry-run --json` | **Pass**: extracted runtime services and Java worker included; nothing published |
| Documentation and whitespace checks | **Pass**: relative links, anchors, skill metadata and changed-file whitespace |
| `npm run test:device` under Node 22 | **Pass**: all 10 files on the final uninterrupted run |

The first device run passed the debugger, interaction, screenshots and correlated
observations, then exposed an undeclared `minimist` import in the existing log
helper. The dependency is now declared explicitly in development dependencies;
the dependency audit remains clear. The final device run is recorded below.

Review confirmed that retry order, watchdog cleanup, platform screenshot policy,
evidence freshness ordering and snapshot parallelism remain in their existing
owners or explicit extracted services. One type-only compatibility export was
corrected after the Node 22 ESM unit run exposed it. No replacement quality
allowances or rule suppressions were added.

## Device results and limits

The final suite used Android emulator `emulator-5554` (API 36 / Android 16)
and booted iOS simulator `F9243BAF-62A8-4990-8A99-17F527F56FDA` (iOS 26.4).
Both ran against the local 0.34.0 build under Node v22.23.4.

- **Pass, Android:** isolated fixture debugger attach, breakpoints, stack/locals,
  pause guards, stepping, stale references, resume and owned detach; clickable
  waits, handle taps, visible/state assertions and labelled SeekBar convergence.
- **Pass, Android and iOS:** screenshots, logs, UI trees and correlated observation
  evidence, including omitted components and foreign-session rejection.
- **Pass, Android Perfetto:** Settings visibility assertion, explicit correlation,
  trace content structure, stop, cancellation, duration expiry and active shutdown.
- **Cleanup:** owned fixture apps/build directories, debugger forwards, device
  captures and host trace artifacts removed. Settings remains foreground without
  settings changes. No observation content was retained by the correlation tests.

The full compiled TypeScript plus Java-source fingerprint reported by the debugger
journey is `f035f362ed32b10ef247f918df8523974e06fb153389de3e6b50ca51cdacf8ae`.
The trace-specific subset fingerprint is
`e90ed0831de4059f1e2b213ed0c050298cf2e55c0cc0aef9ff4ea2a38b6062a0`.
Raw local command output is in `/tmp/health-verify.log`,
`/tmp/health-device-final.log` and `/tmp/health-final-audit.json`; these temporary
files are not repository artifacts.

Hosted CI, physical-device journeys, new interactive iOS coverage and the extended
Android debugger expiry journey remain **unrun**, as excluded in point 4. The
existing simulator observation checks above do not establish those outcomes.
No commit, push or publication was performed.
