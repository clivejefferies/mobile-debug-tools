# Implementation and verification plan

Scope: [intent](intent.md), [approved specification](spec.md). User approved the
revised contract with “ok, lets proceed” on 2026-11-04.

Status: implementation and supported virtual-device checks complete on
2026-11-05, including the trace shutdown repair below. Default idb compatibility
and hardware-specific coverage remain separate limitations.

## Implementation

- [x] Add typed, bounded device-state probes with conservative Android parsing and
  capability-based iOS lock evidence; reuse subprocess and operation budgets.
- [x] Integrate evidence into readiness services, predicate waits, and shared action
  responses, retaining dispatch outcomes and compact/journey evidence.
- [x] Cover parsing, partial failure, recovery, deadlines, debugger precedence,
  targeting and serialization with self-running unit tests.
- [x] Update tool docs, descriptions, README and changelog. Review all changed callers.

## Verification

Node >=22 (CI Node 22); native Android ADB and local Xcode for iOS probes.

| Criteria | Check |
| --- | --- |
| 1, 2: launch, awake/asleep/locked/recovery | Updated server against explicit Android emulator; sleep disposable emulator, launch Settings, inspect readiness, restore awake state |
| 2: transition/conflict/missing fields | Deterministic parser fixtures and failed native probes |
| 3: blocker gating and unknown compatibility | Readiness/predicate wait unit integration |
| 4: debugger, targeting, timestamps, compact/journey | Shared action and probe unit integration; existing debugger guard tests |
| 5: required checks | `npm run verify`, `npm run test:device` |
| iOS boundary | Updated probe against explicitly booted iPhone 17 Pro simulator; verify capability rejection and unknown wakefulness, then shutdown |

Device suite is Android-focused and may contain opt-in checks; record skips.
Physical iOS unavailable; do not claim physical support. CI additionally compiles
the Java worker with JDK 17 and checks package contents; the latest results below
supersede the initial unrun status.
Use existing Settings app for launch reproduction, no user app data changes.
Restore emulator wake state and shutdown any simulator booted for this task.

## Results

Implementation and required baseline verification completed; detailed evidence
and later PR repairs follow. Remaining platform risks: vendor-specific Android output,
extra probe latency, iOS capability differences, and budget expiry during probes.
No publication, release, or protected-branch change is planned.

## Implementation results

Implemented the separate device-readiness contract, Android power/keyguard
parsers, capability-based iOS lock query, pre-observation wait gating, and shared
launch/input response evidence. Known blockers break UI-stability continuity;
recovery requires fresh UI samples. Compact actions and journey action steps
retain the evidence; the separate adjust_control result also carries it. Dispatch success and verification controls retain their
existing meanings. Updated tool descriptions and their full compatibility
fixture, README, tool docs, and changelog.

Focused review covered resolved-device ownership, no cross-call cache, partial
probe failure, conservative parsing, response preservation on observation
failure, debugger priority, and operation-budget clipping. CoreDevice requires
its own timeout argument to be >=5 seconds; the parent process enforces the
1,000 ms probe deadline. Android 17 repeats a numeric wakefulness enum in a later
vendor section: parsing now isolates the named current-state section. Both
runtime discoveries have deterministic regression coverage. No raw native dumps
are included in the response or retained evidence.

## Initial device evidence — 2026-11-04

Local server version 0.36.0, modified checkout based on
`46f86bae52f09be4499867ac581f9308d3892e41`, Node v23.11.0 (supported >=22).
This is local source/built-server evidence, not a published package or hosted CI.

- **PASS — Android emulator 16, emulator-5554:** started awake/unlocked;
  observed a real transitioning-to-asleep state, launched Settings with
  verification disabled, and established successful dispatch alongside
  DEVICE_ASLEEP. Readiness wait returned READINESS_TIMEOUT while asleep, then
  passed after wake-up with fresh settled UI evidence. Restored awake/unlocked
  and Home. [Evidence](android-evidence.json).
- **PASS — Pixel 9 Pro, Android 17:** passive state read established
  DEVICE_LOCKED and input_ready=false. No input or state changes were sent.
  The first power sample was conservatively unknown because of duplicate
  vendor-debug fields; the scoped parser subsequently observed awake/unlocked
  with both timestamped signals. These are separate observations of natural
  device changes, not an automated lock/unlock journey.
  [Lock evidence](android-physical-evidence.json),
  [power evidence](android-physical-power-evidence.json).
- **PASS — iPhone 17 Pro simulator, iOS 26.4:** updated native probe and actual
  get_app_readiness MCP call returned lock_state=unsupported from CoreDevice's
  matching capability rejection, wakefulness=unknown, and input_ready=null.
  UI readiness could still report settled without claiming input readiness.
  Simulator restored to shutdown. [Probe](ios-probe-evidence.json),
  [MCP result](ios-tool-evidence.json).
- **UNRUN — real locked emulator journey:** this emulator wakes unlocked;
  security settings were not changed. Locked classifier evidence exists on the
  physical Pixel, and locked wait gating has deterministic integration coverage.
- **UNRUN — physical iOS, live debugger-paused reproduction, true iOS sleep and
  lock/unlock recovery:** no physical iOS device; opt-in debugger fixtures were
  not run. Managed debugger precedence is covered by deterministic tests, not
  claimed as a new live debugger journey.

## Initial verification results — 2026-11-04

- `npm run verify`: passed, including the rerun after the Android 17 parser
  refinement. Final lint/build and focused action tests also passed after review. Includes lint, size/dependency checks, TypeScript build,
  complete unit suite, and agent-plugin consistency.
- Focused device-readiness parser/probe/action tests, readiness tool/wait tests,
  and compact journey tests: passed. Covers partial probe failure, explicit
  unknown/unsupported outcomes, targeting, timestamps, expired budgets, no raw
  error leakage, blocker gating, fresh recovery, and dispatch preservation.
- `npm run test:device`: passed with a booted iOS simulator. Android/iOS
  screenshots, logs, trees and correlated-evidence checks passed; Android system
  tracing passed with cleanup. Optional coroutine/Kotlin/debugger/interaction
  fixtures and iOS tracing were unrun. The new explicit emulator readiness
  journey was run separately with MCP_READINESS_DEVICE=emulator-5554.
  Initial suite invocation without a booted simulator failed at the iOS
  screenshot prerequisite; booting the simulator resolved that prerequisite.
- `git diff --check` and changed documentation relative-path checks: passed.
- CI uses Node 22, plus JDK 17 worker compilation/package checks. These extra
  hosted checks were not run here. No commit, push, release or publication.

The GitHub project status move remains unconfirmed; CLI project access lacks
read:project, and browser actions were interrupted by concurrent user navigation.
No ticket completion or remote publication is claimed.

## PR #104 review repairs — 2026-11-04

Lightweight fixes restoring the approved contract, based on the four attached
unresolved review threads at head `b78268b`:

- Reset UI-change candidate, change kind and stability timestamp when a device
  blocker skips sampling. A deterministic clock test proves the full change
  stability window must elapse again after recovery.
- Retain last-known blocked power/keyguard axes within the same wait when a
  later probe is inconclusive, including original evidence timestamps and new
  failure limitations. Fresh conclusive evidence clears each axis independently.
  Regression tests cover partial recovery, expired probes and READINESS_TIMEOUT.
- Preserve the native tap/swipe response's resolved device in the action result.
  No new target resolution or guarded-selection change. Tested implicit,
  explicit and already-resolved targeting in debug/compact responses.
- Attempt every emulator restoration command independently and always close the
  client in a nested finally. Aggregate failures after all attempts; report PASS
  only after successful cleanup. Injected failures cover each ADB step and close.

All three production regressions were demonstrated to fail against the original
PR head and pass with these fixes. `npm run verify`, focused regressions and
final lint passed. Device verification results are recorded below.

PR repair verification used local Node v23.11.0 and server 0.36.0. On Android 16
`emulator-5554`, the updated stdio MCP server reported DEVICE_ASLEEP alongside
successful start_app, ordinary tap and swipe dispatches. The readiness wait
returned READINESS_TIMEOUT with DEVICE_ASLEEP still present, then recovered
awake/unlocked; all restoration commands and client close completed. The first
device-suite attempt timed out at the initial readiness RPC before state
changes. A focused retry passed, as did the same journey in the serial suite
retry. No timeout or assertion was weakened. Failed-cleanup paths were verified
with injected failures rather than disconnecting a real emulator.

The serial `MCP_READINESS_DEVICE=emulator-5554 npm run test:device` run passed,
including Android/iOS screenshots, logs, UI trees, correlated evidence and
Android trace cleanup. The iPhone 17 Pro iOS 26.4 simulator was temporarily
booted and restored to shutdown. Optional coroutine/Kotlin/debugger/interaction
fixtures and iOS tracing remained unrun. Hosted CI/JDK 17 package checks remain
separate from these local results. `git diff --check` passed.

## Additional checks without physical devices — 2026-11-05

Requested follow-up: run remaining checks on emulators/simulators and record
limits explicitly. No physical device was selected. Existing fixture tests now
also assert the new device_readiness DEBUGGER_PAUSED blocker and input_ready=false,
and immediate DEBUGGER_PAUSED from wait_for_app_ready on both platforms.

- **PASS — Android emulator debugger**, including the real 60-second pause limit,
  paused readiness and wait blockers, source/locals/stepping, recovery and owned
  resource cleanup. JDK 17.0.11, emulator-5554, Android API 36, extended mode.
  Log: `/tmp/readiness-extra-android-debugger-retry.log`.
- **PASS — iOS simulator debugger**, including paused readiness and wait blockers,
  async/cancellation, real pause expiry, disconnect and shutdown recovery, and
  fixture cleanup. iPhone 17 Pro simulator, iOS 26.4, Xcode 27.2 (27B52),
  Swift-enabled LLDB, extended mode. Fixture-only command-file triggers are used;
  this proves debugger/readiness behaviour, not successful iOS HID tap delivery.
  Log: `/tmp/readiness-extra-ios-debugger-retry.log`.

The first Android extended run failed its expiry assertion with paused state and
pending cleanup after pause_limit was selected; its unchanged-deadline retry
passed. The first iOS attempt timed out during fixture installation; the retry
passed without increasing the install timeout. These initial failures remain
recorded in `/tmp/readiness-extra-android-debugger.log` and
`/tmp/readiness-extra-ios-debugger.log`; they are not counted as passes.

- **PASS — Android interaction fixture:** clickable/visible waits, stored handles,
  selector journey, enabled-state assertion and labelled SeekBar convergence.
  Log: `/tmp/readiness-extra-interaction.log`.
- **PASS — Kotlin locals fixture:** known values before/after assignments,
  stale-frame rejection, UI recovery and owned-forward cleanup. Kotlin/stdlib
  2.0.21 and JDK 17.0.11. Log: `/tmp/readiness-extra-kotlin.log`.
- **PASS — coroutine fixture:** source stops around suspension, dispatch-thread
  locals, completion, cancellation/finally, pause guards and cleanup. Uses the
  same compiler plus coroutines 1.9.0. No logical coroutine-stack claim.
  Log: `/tmp/readiness-extra-coroutine.log`.
- **PASS — local CI-equivalent extras:** JDK 17 worker compilation and all 23
  package inventory entries from the current CI workflow. Hosted unit checks
  for PR #104 head `28d73ff` were also confirmed successful.

All Android fixtures ran sequentially on emulator-5554, and removed their own
packages, temporary builds and debugger forwards. No production source changes
were required. The default iOS trace runner verified capture/cancel/expiry/shutdown cleanup but
failed its input journey: the installed idb_companion 1.1.8 expects SimulatorKit
under Developer/Library/PrivateFrameworks, absent in Xcode 27.2. A direct input
probe confirmed that error. No production or installed Xcode files were changed.

Using the documented test-owned Xcode path alias and isolated companion, the
traced tap-to-Done journey passed with 53 exported sample rows; cancellation,
expiry, stale-ID rejection and failed-journey handling also passed. The same
run failed the final server-shutdown partial-directory assertion, so the overall
compatibility trace run remains **FAIL / partial**, not a pass. A subsequent
resource check found no recorder processes or owned trace directories left.
Logs/evidence: `/tmp/readiness-extra-ios-trace.log`,
`/tmp/readiness-extra-ios-trace.json`,
`/tmp/readiness-extra-ios-trace-compatible.log` and
`/tmp/readiness-extra-ios-trace-compatible.json`.

Remaining software follow-up: investigate the intermittent iOS trace shutdown
cleanup assertion and provide a compatible default idb HID backend. True iOS
sleep/lock recovery cannot be established by this simulator's unsupported lock
probe and unverified wakefulness signal; physical iOS remains outside this
verification run. The default emulator's secure-lock journey was not enabled by
changing security settings; locked wait gating has deterministic coverage and
prior passive Pixel evidence. No new hardware validation is claimed.

Final `npm run verify` passed with the new Android/iOS paused-readiness
assertions. Changed documentation paths and `git diff --check` passed. The
compatibility companion, alias and local JDK compilation output were removed,
and the test-owned simulator was restored to shutdown. The verification-only
test changes and this plan update remain local and uncommitted.


### iOS trace shutdown issue repaired — 2026-11-05

The shutdown finalizer now removes discarded files after a stop error if the
owned recorder has exited; it retains the failure reason and never removes a
possibly live recorder's directory. Regression tests failed on the old code and
passed with the fix. The full simulator trace journey then passed its original
shutdown assertion, with 59 exported sample rows and complete cleanup.
`npm run verify` passed. See [trace repair record](../031-ios-system-traces/plan.md#shutdown-cleanup-repair--2026-11-05).
This supersedes the earlier failed shutdown check; the default idb compatibility
limitation and hardware-only coverage remain explicitly separate.

The shutdown repair also passed the baseline device suite. Temporary verification
resources were removed and the simulator restored to shutdown. The repair and
verification updates are local and uncommitted.
