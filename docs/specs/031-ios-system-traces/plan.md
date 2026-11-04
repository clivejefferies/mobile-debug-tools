# iOS system traces implementation plan

[Intent](intent.md) and [specification](spec.md) approved in this chat on
2026-11-04. Implementation is local on `feature/ios-system-traces`; no publication
or push requested. Preserve Android contracts and unrelated work.

## Implementation

- [x] Add bounded owned subprocess and Darwin-notification helper support.
- [x] Add simulator/app capability discovery and validated Instruments artifacts.
- [x] Add iOS sessions and shared platform routing, limits and journey linkage.
- [x] Extend schemas, public definitions, fixtures and documentation/usage skill.
- [x] Add deterministic lifecycle/native/contract tests and explicit simulator smoke.
- [x] Review resource ownership, failure/retry paths, schemas and Android callers.

## Verification

Node >=22 (use installed Node 22 where needed), Xcode 27.2 and iOS 26.4.1
simulator `F9243BAF-62A8-4990-8A99-17F527F56FDA`. Boot only that simulator,
install the existing offline readiness fixture, launch, start Time Profiler,
run a journey tapping Show loader and asserting Done, stop and validate target,
IDs, readiness ordering, TOC and sample rows. Also exercise expiry, cancel and
failed journey. Remove fixture and restore simulator shutdown afterward.

| Criteria | Checks |
| --- | --- |
| 1 capability/input safety | injected native probes, handler/schema and definition goldens |
| 2 validated linked capture | updated-server simulator smoke with outcome assertion and artifact exports |
| 3 lifecycle and ownership | deterministic native/session failure, concurrency, stale/mismatch, retry tests |
| 4 real lifecycle evidence | simulator explicit stop, expiry, cancellation and journey failure |
| 5 compatibility | Android session tests, existing device suite, full maintainer verification |

Commands: focused `node --import tsx test/unit/...` checks, `npm run verify`,
`npm run test:device`, opt-in iOS trace smoke with an explicit simulator UDID.
CI workflows will be checked for coverage differences. Physical-device capture
is outside the initial matrix and unrun; none is connected. Notification helper
compilation/readiness, PID identity resolution and finalisation deadlines require
early native checks. No test result is implied by the prior feasibility probes.

## Results

Implementation and focused review complete locally. No commit, push or release.

| Check | Result and scope |
| --- | --- |
| Focused native/session/router/tool contracts | PASS: identity/executable matching, notification-before-readiness, stale and mismatched links, shared pending reservations, expiry, cancellation, export retry without restart, storage and subprocess deadlines |
| `npm run verify` | PASS on Node 23.11.0: lint, structural gates, architecture, TypeScript, 94 unit files, agent-plugin consistency. Final post-fix run also passed, including the corrected smoke cleanup harness. |
| `npm run test:device` | PASS on the local emulator/simulator: Android Perfetto capture/readability, explicit stop/cancel/expiry/shutdown plus Android+iOS observation/evidence smoke. 13 files visited; opt-in debugger/coroutine/Kotlin/interaction and iOS trace files report UNRUN without their explicit environment. |
| Focused built-server iOS trace smoke | Full fixture tap → Done UI-tree assertion and sample export passed using the isolated input companion documented in investigation.md. Final standalone combined lifecycle/shutdown run PASS; see simulator-evidence.json. |
| Real iOS shutdown recheck | PASS after allowing recorder finalisation up to eight seconds inside the ten-second server budget. Earlier one-second forced-stop run failed cleanup; that failure was investigated and fixed. |
| Physical device / real native failure injection | UNRUN. Physical capture is outside the accepted initial matrix; disconnect/permission/start/export/storage failure branches have deterministic coverage, not real-device proof. |

Logs: `/private/tmp/mobile-debug-ios-trace-verify-final.log` and
`/private/tmp/mobile-debug-ios-trace-device.log`. CI uses Ubuntu/Node 22/JDK 17;
local validation used macOS/Node 23.11.0 and installed toolchains. Hosted CI is
unrun. No hosted-CI or installed/published-package compatibility claim is made.

Review: schemas, registration goldens, dispatch, response serialization and callers
were checked together. Android adapter/session logic remains intact behind routing.
Recorder handles are owned, process identity is revalidated, artifacts validate
UUID/PID/executable/template/table data, and temporary exports/helpers are removed.
Forced-stop deadlines, incomplete shutdown reporting and oversized-output disposal
were reviewed. No remaining actionable code review finding is recorded.

Local limitations: default idb 1.1.8 HID is incompatible with the Xcode 27.2
framework layout. Successful input evidence uses a test-owned companion with a
private path alias; capture itself uses the actual selected Xcode. Instruments
reported a bounded run warning; successful CPU sample export does not verify all
bundled instruments, scheduling data, symbolication or hang detection.


## Final device result and cleanup

The final standalone built-server smoke passed with build SHA-256
`48eee7b1f71403645ab301def8d83dd14585eec099b221f8ac4f6aaba0941282`.
The UI-tree assertion established Done after tapping Show loader, with readiness
before journey submission, matching correlation identifiers and 70 exported CPU
sample rows in an 11,961,327-byte readable Instruments bundle. Explicit stop,
stale rejection, cancel, duration expiry, failed-journey retention, real server
shutdown and target-app survival passed. The generated report is
[simulator-evidence.json](simulator-evidence.json).

The earlier long-run failure is retained as
[late-run-failure-evidence.json](late-run-failure-evidence.json); it is not called
a pass. The final run used corrected active-session cleanup tracking and explicit
shutdown capability checks, after maintainer verification had finished.

Final `npm run verify`: PASS, 94 unit files, on Node 23.11.0. The native forced-stop
nonclosure case has a bounded deterministic test. The existing device suite's
passed checks and opt-in UNRUN entries are scoped above. Hosted CI remains unrun.

All task-owned fixture installations and trace/probe artifacts were removed. The
test-owned companion was stopped only after verifying its exact command/PID;
its path alias, socket and private diagnostic log were removed. The simulator's
original Shutdown state and fixture absence were verified with simctl and the
filesystem. The original companion and installed Xcode were unchanged. No active
task recording remains. Changes are uncommitted and unpushed.
