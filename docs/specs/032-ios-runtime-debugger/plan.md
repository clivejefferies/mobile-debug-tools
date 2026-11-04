# iOS runtime debugger — implementation and verification

Scope: [intent](intent.md) and [specification](spec.md), both approved by the user
on 2026-11-04. Use the repository MCP Builder and Test Authoring skills.

## Implementation

- [x] Establish LLDB Python loading and explicit simulator/process attribution.
- [x] Add structured LLDB worker, safe inspection, exact breakpoints and watchdogs.
- [x] Reuse session lifecycle with platform-specific native/worker configuration;
      update schemas, dispatch, diagnostics, guards and readiness.
- [x] Add deterministic Swift simulator fixture and MCP runtime/async journeys.
- [x] Add contract, identity, lifecycle and guard regression tests; update tool
      compatibility golden only for approved schema changes.
- [x] Align debugger guide, tool reference, README, changelog and packaging.
- [x] Review diff, execute required verification and record actual results below.
      Full-suite success remains unestablished; see the failed checks below.

## Verification matrix

| Spec criterion | Check |
| --- | --- |
| Core runtime flow | `MCP_IOS_DEBUGGER_DEVICE=<UDID> node --import tsx test/device/automated/debugger/runtime.ios.test.ts` through built stdio server |
| Async/cancellation | Same journey with controlled before/after-await values, nested work, cancellation and fresh UI assertions; separate step-boundary result |
| Identity, failure, references and guards | Focused `test/unit/debugger/*.test.ts`, simulator invalid PID/foreign target, stale frame/stop, guarded input/readiness, event cancellation and detach |
| Expiry and shutdown | Worker watchdog unit checks plus real pause expiry and server EOF cleanup in fixture journey |
| Contract/Android regression | `npm run verify`; existing runtime, Kotlin and coroutine Android MCP checks on explicit emulator |
| Broader device compatibility | `npm run test:device` with selected targets; report the actual covered platforms and skipped prerequisites |

Required: Node 22+, installed Xcode 27.2/Swift 6.4.2/LLDB 2103.0.34.407,
simulator runtime, development fixture compiled with debug metadata and no
optimisation. Android regressions require existing JDK/SDK/Kotlin dependencies.
No physical-device iOS support is claimed. Hosted CI is separate from local checks.

Select existing simulator F9243BAF-62A8-4990-8A99-17F527F56FDA (iPhone 17 Pro,
iOS 26.4), initially shut down. Boot it for the fixture; preserve existing apps
and settings, install/remove only fixture-owned app/build files, detach owned
debuggers, and restore the initial shutdown state. Record exact server/fixture
hashes, observed stops/locals, independent UI state and cleanup. Simulator access
requires outside-sandbox native commands; the authorised inventory read succeeded.
If a prerequisite is unavailable, retain the acceptance criterion and record a
concrete blocker. Do not treat mock/native readiness checks as live verification.

## Results

- **PASS** `npm run verify`: lint/quality/architecture, build, all 96 unit files,
  plugin consistency, Node 23.11.0. Log `/tmp/ios-debugger-final-verify.log`.
- **PASS** `MCP_IOS_DEBUGGER_DEVICE=F9243BAF-62A8-4990-8A99-17F527F56FDA MCP_IOS_DEBUGGER_EXTENDED=1 node --import tsx test/device/automated/debugger/runtime.ios.test.ts`.
  Exact stable-build hash, stops, locals and asserted cleanup/recovery are in
  [evidence.json](evidence.json). No HID success is inferred from fixture control.
- **PASS** focused Android runtime, Kotlin locals and coroutine MCP regressions
  using the existing fixture/compiler dependencies. The broader suite also reran
  the final Android runtime debugger successfully.
- **PASS** unchanged standalone iOS screenshot, log and UI-tree smoke checks.
- **PASS** package dry-run contents, plugin generation/consistency and diff/link
  checks. No publication or installed-package verification occurred.
- **FAIL** broader `ADB_PATH=/Users/clivejefferies/Library/Android/sdk/platform-tools/adb MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device`: initial Android
  interaction request timeout; focused unchanged retry passed. The full-suite
  retry passed that branch and both-platform observations/correlated evidence,
  then failed Android Perfetto active-shutdown artifact removal. The isolated
  Perfetto check passed on both unchanged HEAD and current build. These failures
  remain unreproduced and unexplained; no full-suite pass is claimed.
- Full-suite opt-in Kotlin/coroutine/iOS debugger checks were **UNRUN** in that
  invocation; each passed its separate focused run above. iOS system tracing was
  **UNRUN** (no `IOS_SYSTEM_TRACE_DEVICE` supplied); it is outside this feature.
- **PASS** owned cleanup: no MCP device trace files or ADB forwards remained;
  debugger/coroutine packages and Swift build directories removed. Unrelated
  fixtures preserved; iOS simulator restored to shutdown; Android emulator left
  running. Temporary baseline source/build copy removed.

See [verification report](report.md) for evidence boundaries, resolved findings,
unrun variants and original failed observations.


## PR #103 review repair

- [x] Cache shared iOS preparation and reset rejected preparation for retry.
- [x] Add fake-toolchain coverage for concurrent reuse, retry and worker creation.
- [x] Check real Xcode cached preparation and rerun the focused iOS MCP journey.
- [x] Complete quiet repository verification (97 unit files); repair ready for PR publication.

See the [report follow-up](report.md#pr-103-preparation-cache-follow-up--2026-11-04)
for exact evidence and retained broader-suite limitations.
