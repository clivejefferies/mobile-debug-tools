# Coroutine validation implementation plan

Intent and [specification](spec.md) accepted by two successive “ok” responses
in this chat on 2026-11-02. No new debugger capability is included.

## Work and verification

- [x] Add a separate-package Kotlin coroutine fixture and explicit local-jar build.
- [x] Add opt-in automated MCP journey with bounded subprocesses and owned cleanup.
- [x] Exercise completion, gate suspension, two dispatcher threads and nested work.
- [x] Assess synchronous stepping and a bounded suspension-boundary step attempt.
- [x] Check cancellation/finally, stale references, pause guard and cancelled wait.
- [x] Record fingerprints, compiler metadata and per-journey evidence in report.
- [x] Update fixture README, debugger guide and packaged usage skill.
- [x] Complete repository verify, focused coroutine checks and full device suite.

Acceptance criteria 1–3 map to the opt-in device runner and dated report; criterion
4 maps to repository verification, existing device regressions and doc/link checks;
criterion 5 maps to the evidence-based recommendation in the report.

Use Node 22+, JDK 17, Kotlin/stdlib 2.0.21, coroutines 1.9.0 and Android SDK 36.
Initial fixture state: package absent, emulator-5554 authorized, no owned session.
Start the generated APK, attach existing MCP debugger, assert source/event/locals
observations, resume/detach, assert fresh completion or cancellation UI, then
remove owned package, temporary files and forwards. Keep source/compiler/APK/server
hashes and distinguish emulator from optional physical-device evidence.

Commands (with documented compiler/stdlib/coroutine paths set):

```sh
npm run verify
MCP_COROUTINE_DEVICE=emulator-5554 npx tsx test/device/automated/debugger/coroutine.android.test.ts
MCP_COROUTINE_DEVICE=emulator-5554 MCP_KOTLIN_DEVICE=emulator-5554 MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device
```

Check prerequisite availability before install. Missing jars/compiler/device are
blocked; unspecified opt-in serial is unrun. No automatic dependency downloads.
Physical device is optional and reported separately; hosted CI does not provision
this compiler/fixture. Compiler-generated locations and absent ART locals are
assessment findings, not permission to weaken safety assertions. Runtime defects
or follow-up capabilities require separate scope decisions.

## Results — 2026-11-02

- Focused coroutine check **PASS**, emulator-5554, Android 16/API 36. Completion,
  dispatcher names, synchronous steps, bounded suspension-step observation,
  breakpoint workaround, cancelled wait, stale frame, pause guard, cancellation
  and cleanup passed. Evidence: [report](report.md), [compact record](evidence.json)
  and `/tmp/mobile-debug-93-emulator.log`.
- Final `npm run verify` **PASS**, Node 22.23.4: lint/quality/architecture,
  TypeScript build, all 89 unit files and plugin consistency. Log:
  `/tmp/mobile-debug-93-final-verify.log`. The sandbox denied tsx IPC pipe creation;
  the authorized run outside the sandbox passed without changing checks.
- Full `npm run test:device` **PASS**, all 12 files, with all three debugger
  opt-ins above. Coroutine and existing Kotlin/Java debugger, interaction,
  Android/iOS observation smoke, correlation and Android system-trace checks
  passed. Log: `/tmp/mobile-debug-93-device.log`. iOS observation does not verify
  iOS runtime debugging. The coroutine fixture/package/forwards were cleaned up.
- Changed Markdown relative links and `git diff --check` **PASS**.
- Physical coroutine checks, forced termination/device disconnect and hosted CI
  **UNRUN**. No new runtime capability or production-code fix was required.
- Focused review checked device/package targeting, pause/stale guards, event
  cursor overflow, compiler source mapping, subprocess bounds and owned cleanup.
  Compiler scope elimination and fixture starting-state problems were addressed
  in test setup; no server contract change was introduced.

## PR #96 review repairs — 2026-11-02

Lightweight repair of the three attached review comments; no capability or
contract change. `feature/coroutines` started clean at
`a46c9091d5df8f064e4c1d5961a708964b2ed74d`.

- Overall JSON reporting now encloses work and cleanup. PASS is emitted only
  after cleanup; cleanup failures emit FAIL and reject the run. Unit regression
  checks cover successful cleanup, work failure and cleanup failure with either
  successful or failed work.
- Both gate-readiness messages are posted by work queued on the waiting
  coroutine's single-thread executor, after its gate wait yields. Compiler
  metadata changed the dispatcher/result breakpoint class to `completeWork$3`;
  both bindings were updated.
- All forwarding snapshots filter the exact device serial and normalize ordering.
  Unit coverage changes another device's forwards, reorders the target's table
  and confirms target forward removal still fails comparison.
- `npm run verify` **PASS**, Node 22.23.3, all 90 unit files, lint, quality,
  architecture, build and plugin consistency. Log: `/tmp/pr96-verify.log`.
- First device run **FAIL** due to the restored emulator snapshot becoming
  unresponsive during installation and uninstall. The actual cleanup failure
  emitted JSON FAIL with no overall JSON PASS. Log: `/tmp/pr96-device.log`.
  Cold-started the existing Android 36 AVD without wiping data; removed the
  task-owned leftover package once the guest recovered. The Pixel_8 AVD could
  not start because its configured Android 37.1 system image is absent.
- Final `npm run verify` **PASS** after preserving simultaneous work/cleanup
  errors in an AggregateError; all 90 unit files. Log: `/tmp/pr96-final-verify.log`.
- Full device-suite attempts **FAIL** at fixture setup on this emulator:
  incremental installation timed out and continued installing in the guest;
  cold-start logs: `/tmp/pr96-device-cold.log`. No checks were weakened.
- Focused Android 36 rerun using a temporary `ADB_PATH` wrapper that adds
  `--no-incremental` only to installation: completion, gate-readiness,
  dispatcher/result source bindings, synchronous stepping, pause/stale guards,
  cancelled-wait recovery and bounded suspension-step observation **PASS**.
  The run then **FAIL**ed restarting the owned fixture before cancellation
  (`am start -W` timeout), with an additional uninstall timeout. The overall JSON
  result is FAIL and preserves both errors; cancellation remains **UNRUN** for
  the repaired fixture. Log: `/tmp/pr96-focused-streamed.log`.
- Final independent package query confirmed the owned package absent; the
  forwarding table was empty. Temporary build output was removed. Physical
  checks and hosted CI remain unrun. Native verification is partial, not a full
  suite pass; the remaining limitation is recorded rather than bypassing it.

## Retry on the maintainer's running emulator — 2026-11-02

The complete repaired coroutine journey **PASS**ed on the already-running
emulator-5554, Android 16/API 36, at commit `1497693`. This includes cancellation
readiness, the child finally breakpoint, cancelAndJoin, fresh cancellation UI,
completion, synchronous steps, guards, cancelled-wait recovery and final cleanup.
Overall JSON PASS was emitted after package/build-output/forward cleanup.
Log: `/tmp/pr96-user-emulator.log`. No test source, assertions or deadlines changed.

Runtime: Node 22.23.3, fixture compiler Kotlin 2.0.21/JDK 17.0.11, coroutines 1.9.0.
The local `ADB_PATH` wrapper selected streamed (`--no-incremental`) installation;
`JAVA_TOOL_OPTIONS='-Xmx512m -XX:TieredStopAtLevel=1'` reduced host JVM startup cost.
The existing emulator was used directly and is left running. Its existing user
apps/data were not cleared. Full device regression results are recorded below.

The full `npm run test:device` retry passed coroutine, Kotlin/Java debugger,
interaction and Android screenshot checks, then **FAIL**ed at the iOS screenshot
check because multiple matching iOS simulators were available and no target was
selected. Log: `/tmp/pr96-user-device-suite.log`. Separate Android logs and UI-tree
checks **PASS**ed, as did the Android correlated-evidence portion; its required
iOS portion **FAIL**ed because no iOS simulator was running. Log:
`/tmp/pr96-user-android-remaining.log`. These iOS setup failures do not represent
an Android emulator failure; they prevent claiming a complete suite pass.

The separate Android system-trace check **FAIL**ed its cancellation assertion:
`cancel_system_trace` returned `failed` / `ACTION_TIMEOUT` instead of `cancelled`.
The test's finally cleanup retry completed. Log: `/tmp/pr96-user-trace.log`.
This does not change the repaired coroutine journey's PASS result and prevents
claiming all Android smoke checks passed. No tracing code or assertions changed.

Perfetto investigation: three direct start/cancel probes and three full MCP smoke
journeys subsequently **PASS**ed with unchanged production code/assertions. The
final MCP run recorded command timings; process lookup max 111 ms, signal max
63 ms, no command timeouts. Owned artifacts/files/forwards were cleaned up. The
original ACTION_TIMEOUT was not reproduced and is not root-caused; no runtime
fix or relaxed deadline is claimed. See the report's Perfetto investigation and
`/tmp/pr96-perfetto-mcp-timings.log`. This supplies passing current trace evidence
without erasing the original failed run; iOS setup limitations remain separate.
