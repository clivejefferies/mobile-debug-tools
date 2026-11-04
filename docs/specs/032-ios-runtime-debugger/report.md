# iOS runtime debugger verification — issue #70

Date: 2026-11-04. Scope: [approved specification](spec.md).
Implementation: existing eleven MCP debugger tools gain the optional simulator
LLDB backend; Android remains on JDI. This is local source/build verification,
not hosted CI, an installed package, a publication or physical-device evidence.

## Environment and method

macOS, Node 23.11.0 (repository requires >=22; hosted CI selects Node 22),
Xcode 27.2/27B52, LLDB 2103.0.34.407 and Swift 6.4.2. Simulator:
F9243BAF-62A8-4990-8A99-17F527F56FDA, iPhone 17 Pro, iOS 26.4.
The disposable Swift fixture uses `-g -Onone`, targeting iOS 18 simulator.

The runner communicates with a freshly built stdio MCP server. It checks actual
source stops, stack frames and synthetic known-value locals; independent fresh
MCP UI-tree assertions establish completion/cancellation and recovery. It does
not infer logical task identity from opaque thread IDs or task/thread names.

Installed idb can read UI trees but cannot inject HID with this Xcode: its
SimulatorKit framework path is absent. Therefore fixture actions use a private
command file, delivered by atomic rename and handled by the fixture main-loop
timer. This is independent fixture control, not proof of successful MCP tap
injection. Paused MCP taps are checked for rejection before dispatch. No
production app instrumentation, source evaluation or security changes are used.

## Evidence and results

The final stable-build simulator journey **PASS**ed with real pause expiry enabled.
[Compact evidence](evidence.json) records the exact server/fixture/test hashes,
source stops and bounded synthetic values. Recomputing the final source/build hash
matched the runtime fingerprint. Log: `/tmp/ios-debugger-final.log`.

| Check | Result |
| --- | --- |
| Exact source binding; pending source; non-executable line rejection | PASS |
| Core stack/locals and into/over/out | PASS: known=41, fresh result=42 UI |
| Pause guard/readiness and stale references | PASS |
| Cancelled event wait and usable running session | PASS |
| Before/after await with nested async child and actor/main-actor transitions | PASS: known=42, after=43, fresh Async result 44 UI |
| Step over await | PASS: source line 20 to line 21 in the resumed partial function |
| Task cancellation | PASS: cancelled=true and fresh Task cancelled UI |
| Real 60-second pause expiry | PASS: pause_limit, complete cleanup and fresh result UI |
| Target process exit | PASS: disconnected state, complete cleanup and fixture relaunch |
| Idempotent detach and server shutdown while paused | PASS: no remaining resources; independent fresh result UI |

`npm run verify` **PASS**: lint/structural/architecture checks, TypeScript build,
all 96 unit files and generated plugin consistency. Log:
`/tmp/ios-debugger-final-verify.log`. The portable usage skill and generated Cursor
copy now describe the advertised iOS backend; this does not install/update a
connected or pinned published server.

The broader device suite passed the final Android debugger regression, then
**FAIL**ed on an Android interaction SDK request timeout (120000 ms); its original
log does not identify the call. A focused assertion-identical retry with tool-name
and elapsed-time logging **PASS**ed every call (approximately 47 seconds total).
The timeout was not reproduced and its cause is unknown; no assertion, timeout,
retry policy or interaction implementation was changed. Original and retry logs:
`/tmp/ios-debugger-device-suite.log` and
`/tmp/ios-debugger-interaction-retest.log`. The unchanged full-suite retry passed the Android debugger/interaction checks and
both-platform screenshot/log/tree/correlated-evidence checks, then **FAIL**ed the
last Android Perfetto active-shutdown cleanup assertion (one owned capture file
still existed). Log: `/tmp/ios-debugger-device-suite-retry.log`.

The same isolated Perfetto test then **PASS**ed on both unmodified HEAD
`8bafc318a6342cf4585621d2108353836d40f72d` (archived and compiled in a temporary
copy using the same dependencies) and the current build. Logs:
`/tmp/ios-debugger-trace-baseline.log`, `/tmp/ios-debugger-trace-current.log`.
This does not establish the original timeout/cleanup cause or prove it fixed.
No tracing source, assertion or deadline was changed; no full device-suite pass
is claimed. The failed check's exact owned artifact was removed through the
existing identity-checking trace adapter. Final checks found no MCP capture files
or ADB forwards. Debugger/coroutine test packages and Swift build directories were
removed; unrelated installed fixtures were preserved. The iOS simulator was
returned to its initial shutdown state; the Android emulator remains running.

Independent unchanged iOS screenshot, log and UI-tree smoke checks **PASS**ed.
Log: `/tmp/ios-debugger-ios-observations.log`. These establish observation delivery
and structure, not a layout claim or successful HID input.

The initial Android runtime, Kotlin locals and coroutine MCP regressions passed
on emulator-5554, Android 16/API 36. Kotlin/stdlib 2.0.21, coroutines 1.9.0 and
fixture JDK 17.0.11 used existing cached dependencies and `/tmp/pr96-kotlinc`.
The debugger uses its ordinary Android Studio JBR discovery. Raw local logs:
`/tmp/ios-debugger-android-regression.log`,
`/tmp/ios-debugger-kotlin-regression.log`,
`/tmp/ios-debugger-coroutine-regression.log`.

`npm pack --dry-run --json` and explicit contents assertions passed for all three
LLDB Python modules and compiled iOS backend modules. CI packaging assertions now
cover these resources. This does not establish installed-package loading.

## Findings resolved during development

- Ignore internal LLDB transitions without stopped-thread evidence; consume LLDB
  process events before reading public process/thread snapshots.
- Keep fixture variables live across await. The original constant's scope had no
  location in a resume partial function; requiring its later use preserved actual
  `known=42` inspection. Assertions were retained, not replaced by availability.
- Use LLDB's invalid-line sentinel for the error-reporting StepInto overload;
  line zero is not that sentinel. Check native step errors before acknowledging.
- Normalize Swift Bool static storage to textual true/false; never evaluate a
  getter, formatter, expression or object description.
- Preserve known suspension when a stale/invalid step is rejected. Diagnostic
  lifecycle fallbacks cannot bypass pause guards.
- Bound and reuse frame references; preserve cleanup uncertainty after lost worker
  or process handles instead of treating process closure as confirmed release.
- Classify signals/exceptions separately from completed steps. A synchronous
  `simctl terminate` probe timed out while attached; the fixture now exits itself
  to test actual process-exit cleanup without blocking the runner on a signal stop.
- URL-based fixture control encountered a system confirmation. The simulator was
  rebooted to clear this fixture-created prompt; URL control was removed. Atomic
  file delivery avoids the timer observing a partially written command.

These failed development observations remain distinct from successful reruns;
none is represented as evidence that all environments or timings are covered.

## Limits and review

Physical iOS devices, other Xcode/Swift/runtime versions, optimized builds,
installed/published-package operation, real device disconnect, forced host kill,
long idle/absolute expiry and a late-loaded-image binding journey remain unrun.
Pause expiry is checked live; idle/absolute expiry logic also has deterministic
worker/host unit coverage. Pending source creation is checked independently.

Swift strings and other aggregate locals expose type/opaque reference summaries;
standard supported numeric/bool wrappers use static storage. Missing debug values
remain explicitly unavailable. No suspended-task enumeration or complete logical
async-stack reconstruction is exposed. Async stepping evidence is the tested
step-over-await route, not every Swift concurrency construct.

Focused review covers target membership/start identity, source resolution, strict
schema/dispatch parity, bounded IPC/inspection, stop epochs, diagnostic privacy,
platform guards, expiry and owned teardown. Android contract compatibility remains
covered by its existing fixture and unit tests; iOS scope is simulator-only.
