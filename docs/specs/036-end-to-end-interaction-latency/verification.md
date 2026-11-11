# Verification evidence

## Local checks

- `npm run verify`: **pass** on the final checkout with device workloads stopped. Lint,
  structural/architecture gates, TypeScript build, 112 automated unit files and
  agent-plugin consistency checks completed. Local Node is 23.11.0; CI uses 22.
- The run overlapping iOS startup and smoke execution failed the existing
  `server/conditional_actions.test.ts` 150 ms action-budget assertion. The
  assertion was preserved and passed on the final run.
- New deterministic checks cover failed/empty sample accounting, overlapping
  spans, observation validity/device identity, metric redaction, instrumented and
  uninstrumented return behavior, concurrent request isolation, and exception
  recording. The real process test verifies timeout/interrupt cleanup including
  a child that ignores SIGTERM. Darwin's transient post-kill EPERM is treated as
  unconfirmed existence until ESRCH; it never counts as successful cleanup.
- `git diff --check`: **pass** during implementation; repeat at final review.

The final CI workflow also compiles the optional Java debugger worker and checks
package contents; those additional checks are not part of `npm run verify` and
were not separately executed for this instrumentation-only change. Android
integration CI is manually triggered. No hosted CI run or installed-package
compatibility result is claimed.

## Native evidence

All executed Android actions target the named Android 16/API 36 emulator.
The connected physical Android phone was not selected for actions. For the
existing device suite, a temporary ADB_PATH forwarding script exposed only the
emulator in discovery, rejected different explicit serials, and forwarded real
commands to the installed adb; no tool output or assertions were mocked. The
benchmark itself uses the real adb and explicit device IDs, and records discovery
topology because existing device resolution can enumerate other attached devices.

- `ADB_PATH=/private/tmp/ticket100-adb MCP_ADB_TIMEOUT=30000 npm run test:device`:
  **blocked / exit 1**. Android compact-result smoke passed dispatch-only,
  post-observation, absent-target, journey, and diagnostics checks. The next
  iOS branch asserted that a booted simulator was required and stopped the suite.
  Optional coroutine, Kotlin and runtime debugger fixture checks reported unrun.
- Individually executed `capture_screenshot.android.smoke.ts`,
  `get_ui_tree.android.smoke.ts`, and `get_logs.android.smoke.ts` using the same
  forwarding configuration: **pass**. These are real emulator observation
  checks, separate from benchmark timing and iOS coverage.
- Development `end-to-end.ts --smoke`: **pass**, 11/11 cases, both owned servers
  and fixture cleanup confirmed. This was a harness-development run; later
  attribution/validation additions mean its source/build is not the final
  repeated-run baseline. It is explicitly not performance evidence.

The default device smoke leaves Android Settings foreground; it changes no
settings or user app data. Benchmark attempts reset only the dedicated latency
fixture, change no display settings and force-stop the fixture on exit. Existing
fixture installations are retained; run-created installations are removed.

## Platform prerequisites

`xcrun simctl list devices booted` initially found no booted simulator. A PATH-only
check missed idb, but subsequent inspection of the owning `getIdbCmd()` resolver
found a working common-location fallback; its Python package is fb-idb 1.1.7.
The original PATH-based unavailable assessment was incorrect. Android raw
metadata retains that initial PATH probe; it does not establish iOS tool absence.

The isolated iPhone 17 Pro booted iOS 27.2 runtime build 24B8117. The local
stdio smoke failed the Settings readiness assertion after 32.6 seconds and
recorded zero performance samples. A subsequent Mobile Debug MCP screenshot
showed a blank app content area. Its UI tree reported the idb prerequisite
unavailable. Direct `idb list-targets --json` failed with a companion listing
error, though a later direct `idb_companion --list 1` succeeded. Root cause
remains unresolved. Both owned servers exited. The temporary simulator was
shut down and removed, and its remaining idb companion was stopped by matching
the temporary simulator ID. The full native suite remains incomplete.

The shared #89 static/network fixture remains absent. Equivalent fixture
journeys remain blocked and physical iOS is excluded.

## Performance evidence

Android measurement is partial. Nine successful samples per case precede the
emulator's exit 139. Two measured and three warm-up failures are preserved, with
nine planned attempts unrun. Both server groups exited. The crashed emulator
prevented fixture force-stop confirmation. See the
[investigation report](../../benchmarks/end-to-end-latency/investigation.md).
Fixture compilation uses offline SDK tools, not Gradle. Validation-suite runtime
is outside the benchmark; it is not included in request percentiles. Device-side
application work remains included in request timings and is not separately
profiled. No runtime optimization has been implemented or claimed.
