# Plan: correlated evidence

Authorisation: [intent](intent.md), then [spec](spec.md), explicitly approved by
“yes” and “approve” respectively in this conversation on 2026-10-29.

## Implementation

- [x] Add per-call evidence context, bounded action history, clocks/freshness/types.
- [x] Propagate action/journey IDs; instrument dispatch and verification phases.
- [x] Instrument platform observations, snapshot components, stream device ownership.
- [x] Register/validate actionRef; preserve compact/debug/image/log responses.
- [x] Add regression coverage; align tool docs, README, changelog.
- [x] Review contract, ownership, concurrency, and privacy; complete checks below.

Reuse async-local context, resolution, budget, and trace helpers. Node >=18
(package/CI requirement); use installed Node/npm/ADB/Xcode tooling. No install,
publish, commit, push, or device helper APK is required. Retain old response data.
Risks are missed nested dispatch/capture paths and incorrect stream targeting;
test adapter boundaries and serialization as well as the metadata helper.

## Verification

| Criteria | Check |
| --- | --- |
| 1: matching identifiers | Handler tests: compact/debug actions, screenshot/log references, journey propagation; local-server Android/iOS journeys. |
| 2: accurate phases | Boundary tests: conditional rejection, no verification, failure/timeout, repeated input; real action before screenshot/log collection. |
| 3: freshness | Controlled clock/order tests for every specified status/reason and cached source time. |
| 4: isolation | Concurrent call/device tests; expired/evicted/foreign-session references; stream-owned device. |
| 5: compatibility/resources | Partial/disabled snapshot and response serialization tests; content-free bounded history. |
| 6: limitations | Assert unsupported trace context and device-log clock limitations on both providers. |

Commands: focused `npx tsx test/unit/observe/correlated-evidence.test.ts`,
`npm run verify`, `npm run test:device`. CI uses Node 18 for lint/build/unit;
Android integration is manual workflow dispatch; local verify additionally checks
the agent plugin. Device suite coverage must be reported, not assumed.

Device journey: updated local server (record package/build), Android emulator-5554
and booted iPhone 17 Pro simulator. Starting state: fixture/system Settings app;
launch it, collect referenced screenshot and bounded logs, verify IDs, dispatch
and capture intervals, image/log preservation and explicit clock limitations.
Use fresh device discovery. Exercise disabled/partial snapshot and invalid
reference without changing app data. Record pass/fail/blocked/unrun plus metadata
in this directory; avoid saving screenshot/log contents. Restore changed settings,
stop only owned streams, and remove temporary test data. No settings change is
needed. Android log healthcheck was degraded: targeted read is the next check;
if unavailable, record its concrete error and verify metadata failure behaviour.
iOS physical-device coverage is outside existing simulator support.

## Results

Implementation and focused review completed on 2026-10-30. Review corrected
journey step completion/verification timestamps, explicit Android stream dispatch
targeting, stream cleanup ownership, and concurrent iOS screenshot filenames.
No outstanding findings in correlation implementation. Correlation history
contains no capture content; later Modul8 testing below records selector limits.

- Local runtime: Node 23.11.0 / npm 10.9.2; CI's Node 18 runtime was not run locally.
- Focused evidence helper and MCP handler tests: **pass**, including fake-native
  Android/iOS dispatch, timeout/precondition failures, compact/debug serialization,
  deferred journey verification, stream ownership, clocks, expiry, eviction,
  concurrent devices, partial/omitted captures, and reference rejection.
- `npm run verify`: **pass** after review fixes (lint, build, all automated
  unit tests, agent-plugin consistency).
- `npm run test:device`: **pass** on final code. Six existing screenshot/log/tree
  smokes cover Android and iOS with automatic targeting (their output does not
  identify each selected device); the new smoke covers rebuilt stdio-server
  correlation on Android emulator-5554 (Android 16) and iPhone 17 Pro simulator
  F9243BAF-62A8-4990-8A99-17F527F56FDA (iOS 26.4). This does not exercise physical
  iOS or all interaction journeys.
- New real-device journeys: **pass** for Settings launch, referenced screenshot,
  bounded logs, UI-tree acquisition, disabled snapshot components, pinned device,
  and foreign-session rejection. Targeted Android logs succeeded despite the
  earlier healthcheck warning. Phase times/IDs/build hashes are in
  [device-evidence.json](device-evidence.json); no image/log content is retained.
- Cleanup: test-owned fake streams/files removed. No device settings or app data
  changed; system Settings remains foreground on the emulator and simulator.
- Physical-device correlation, installed/published-package verification: **unrun**.
  No release or deployment was requested.

Validation logs for this local run: `/tmp/mobile-debug-correlated-verify.log` and
`/tmp/mobile-debug-correlated-device.log`. The `tsx` CLI requires local IPC blocked
by the sandbox; required npm checks ran with approved escalation. Focused checks
also passed via `node --import tsx` without that socket.

## Modul8 follow-up verification — 2026-10-30

User identified the installed Modul8 app as an additional fixture. Tested the
rebuilt local 0.32.4 server over MCP stdio on emulator-5554 (Android 16), using
`com.ideamechanics.modul8.dev` version 0.3.1-dev / code 14. Started on Subscription,
navigated to Favourites and Gener8, and restored Subscription, confirmed by the
final UI tree. No settings, account/subscription data, favourites, or sessions changed.

- **Pass:** screenshot-confirmed navigation, matching action/session/correlation
  IDs across referenced screenshots, UI trees and app-scoped logs; distinct
  capture/dispatch/verification times; pre-action stale and post-action fresh
  records. Device-log freshness correctly remains unknown.
- **Pass:** an expectation matching the current screen allowed input. Reusing the
  Favourites revision after navigating to Gener8 returned `PRECONDITION_FAILED`
  with null dispatch timestamps. Failed selector calls also retained null
  dispatch/verification times and could be referenced by subsequent captures.
- **Fail, existing selector limits:** default `tap_element` lookup exhausted its
  1,500ms observation budget (baseline 3701f39 has the same default). With a
  10,000ms lookup/15,000ms action budget, the Gener8 text leaf was found but
  rejected as `ELEMENT_NOT_INTERACTABLE`; its parent is clickable. Guarded
  screenshot-based coordinate navigation passed. These are not correlation
  regressions and were not changed in this follow-up.
- Fresh screenshots can capture a crossfade: recent acquisition does not prove
  settled UI. No settled-state or causal-log-emission claim was made.

[modul8-evidence.json](modul8-evidence.json) retains metadata and outcomes, excluding
screenshots, UI text, and log contents. Temporary screenshots/client were removed.
Only verification documents changed; link/JSON/whitespace checks passed. Existing
maintainer/device results above apply to the unchanged implementation.

## Selector repair — 2026-10-30

User explicitly requested fixing the Modul8 selector failures. Lightweight bug-fix
path: restore existing clickable-ancestor targeting for selector taps after an
exists/visible wait; use the configured action budget for a single fresh lookup
(default 5 seconds); preserve `ACTION_TIMEOUT` on failed acquisition. Keep matching,
ambiguity/index rules, standalone wait results, hidden/disabled-node checks, and
conditional dispatch guards intact. Preserve unrelated correlated-evidence work.

- Implementation: `executeTapElement` lookup budgeting and internal tap-target
  resolution in `waitForUIHandler`, reusing the existing ancestor helper.
- Regression checks: actual resolution/tap pipeline with a Modul8-shaped label
  and clickable tab parent; default/exists/visible/clickable waits; explicit
  timeout budget; timeout vs absence; hidden/disabled labels/parents; plain
  labels; ambiguity; standalone wait behaviour. Focused checks **pass**.
- Device check: explicit manual fixture helper
  `node --import tsx test/device/manual/interact/modul8_selector_tap.manual.ts`;
  rebuilt server, emulator-5554, Modul8 dev. Verify default selector navigation
  through Favourites/Gener8, exists/visible selector taps, and restored Subscription
  using semantic assertions. **Pass**: all five selector taps and destination
  assertions succeeded; no coordinate fallback was used. Metadata is in
  [modul8-selector-fix-evidence.json](modul8-selector-fix-evidence.json).
- Final checks: `npm run verify` **pass** (65 unit files, lint/build/plugin check);
  `npm run test:device` **pass** (7 smoke files, Android/iOS observation and
  correlation coverage). Native selector repair verified on Android/Modul8;
  equivalent iOS app selector navigation remains **unrun**.
- Focused review: matching/index/ambiguity and direct handle behaviour preserved;
  tap-only ancestor resolution reuses the existing policy and acquisition;
  hidden/disabled labels cannot route through an enabled parent. No outstanding
  findings. Documentation links/JSON/whitespace checks passed.
- Cleanup: after the general device suite reopened system Settings, relaunched
  Modul8 and semantically confirmed the original Subscription screen. No app data
  or device settings changed; temporary cleanup client removed.
- Historical failures in `modul8-evidence.json` are retained as before-fix evidence;
  this repair supersedes their unresolved-selector status. Validation logs:
  `/tmp/mobile-debug-selector-fix-verify.log`, `/tmp/mobile-debug-selector-fix-device.log`.
