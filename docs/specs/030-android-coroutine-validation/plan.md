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
