# Plan: app readiness signals

Date: 2026-10-29. Status: complete — implementation and required verification passed.
[Intent](intent.md) and [spec](spec.md) separately approved in this conversation;
“yep” authorises implementation of spec 021. Preserve existing uncommitted work.

## Implementation

- [x] Add a request-local classifier and typed, bounded evidence summaries in
  `src/observe/readiness.ts` and shared types.
- [x] Add summaries to tree observations without extra reads; expose strict new
  tool schemas/handlers using pinned devices and existing operation budgets.
- [x] Add opt-in readiness to existing UI/changed-UI waits, sharing their samples
  and one deadline; retain default semantics.
- [x] Add deterministic classifier, schema, wait, native acquisition/error/timeout
  tests in `test/unit/`; reuse existing self-running `tsx` conventions.
- [x] Update tool docs, README/changelog, and packaged agent usage guidance.
- [x] Verify, review the changed contracts, and record results below.

## Verification

| Criteria | Checks |
| --- | --- |
| State precedence and uncertainty | Explicit expected classifier outputs with controlled monotonic times; native/label loaders, changes, stable UI, empty/error/old-session/wrong-device samples |
| Bounded sampling and isolation | Production observation adapters with fake binaries, timeout/child-close evidence, outer budget, concurrent requests, no late success |
| Schemas and compatibility | SDK JSON-schema validation against runtime validation; compact/debug tree responses; default and opt-in waits; no extra reads |
| Real device behaviour | Updated server over MCP stdio on Android emulator and iOS simulator: stable UI, controlled loader → settled, bounded loading timeout, predicate present during loader, and changed-UI wait |

Commands: focused tests with the existing `tsx` runtime, `npm run verify`,
`npm run test:device`, and a reproducible focused device helper under
`test/device/manual/`. Native fixture apps provide a timed loader without
accounts, network services, settings changes, or inspection helper services.
Use the existing Android fixture build conventions and installed iOS SDK tools.
Known targets: Android `emulator-5554`; iOS
`F9243BAF-62A8-4990-8A99-17F527F56FDA` (reconfirm availability).
Fixture builds/access are local prerequisites owned by this task. Record exact
routes, artifacts, build identity and cleanup; restore original foreground apps.
Unsupported unresponsive/debugger pause signals must remain explicit, not tested
as implemented capabilities. No deployment or package publication is required.

## Results and review

Local build/version: working-tree `dist/server.js`, MCP handshake 0.32.4,
Node v23.11.0. This is local evidence, not a published package or Node 18 CI run.

| Check | Result / evidence |
| --- | --- |
| Classifier, schemas, opt-in waits | PASS: state precedence, monotonic stability, invalid/error continuity, no extra predicate reads, explicit unsupported states, timeout uncertainty |
| Production Android/iOS observation adapters with fake binaries | PASS: two-sample stability, native loaders, timeout child closure, and killing a hung iOS metadata probe; simulated error evidence |
| Maintainer checks | PASS: final `npm run verify` (lint, build, 62 unit-test files, plugin consistency); `/tmp/mobile-readiness-verify-complete.log` |
| Existing `npm run test:device` | PASS: all six Android/iOS screenshot, log, and tree smoke wrappers; `/tmp/mobile-readiness-device-suite.log` |
| Native fixture journeys through built MCP stdio | PASS: six on each simulator; evidence linked below |

Focused device commands (each builds, installs, and uninstalls its own offline
native fixture; temporary artifacts are removed):

```sh
node --import tsx test/device/manual/interact/readiness.manual.ts \
  --platform android --id emulator-5554 --output /tmp/mobile-readiness-android.json
node --import tsx test/device/manual/interact/readiness.manual.ts \
  --platform ios --id F9243BAF-62A8-4990-8A99-17F527F56FDA \
  --output /tmp/mobile-readiness-ios.json
```

Android 16 sdk_gphone64_arm64 and iOS 26.4 iPhone 17 Pro were explicitly pinned.
Starting state: newly launched fixture, Ready visible, loader hidden. Show loader
starts a 12-second loader while Ready stays visible; completion displays Done.

| Scenario | Android | iOS | Observed proof |
| --- | --- | --- | --- |
| Stable content | PASS | PASS | Two fresh samples report settled |
| Controlled loader | PASS | PASS | Loading; Android native indicator, iOS accessible label marked heuristic |
| Bounded wait | PASS | PASS | 100 ms deadline rejects readiness; unknown plus deadline limitation, no invented unresponsive state |
| Predicate + readiness | PASS | PASS | Ready remains visible during loading; success only after settled, Done independently observed |
| Changed-UI wait | PASS | PASS | Loader completion changes hierarchy; opt-in wait returns success with settled evidence |
| Readiness wait success | PASS | PASS | Bounded wait establishes settled content |

All twelve device scenarios passed. Both fixture apps were uninstalled, build
folders removed, Android’s original foreground app restored, and iOS returned
to Home. No settings, permissions, accounts, or production app data were changed.
Structured evidence: `/tmp/mobile-readiness-android.json` and
`/tmp/mobile-readiness-ios.json`.

Review covered classification/normalization, schema parity, serialization,
request-local state, ancestor budgets, native acquisition and cleanup, existing
wait callers, conditional-action compatibility, and evidence privacy. Findings
fixed: discovery budget expiry must not look like a proven missing device;
iOS probes/metadata must respect the active budget; timeout envelopes must retain
an already-observed predicate instead of pretending its target was absent.
The Android helper uses the stable accessibility ID, avoiding button-case
variation. Initial fixture attempts exposed these issues and were not counted
as passes; the later runs above passed without weakening assertions.

Limits: unresponsive/debugger-paused detection remains unsupported. Stability
covers normalized sampled UI, not app identity, responsiveness, backend outcome,
or atomic input readiness. Transport cancellation still relies on deadlines.
No mutation testing or physical-device input checks were performed. The prior
conditional work was committed externally during this task and was preserved;
this task did not commit, push, or publish readiness changes.

Final source/diagnostic correction was covered by the completion verification run.
Documentation relative links and `git diff --check` also passed.
