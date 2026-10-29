# Plan: correlated evidence

Authorisation: [intent](intent.md), then [spec](spec.md), explicitly approved by
“yes” and “approve” respectively in this conversation on 2026-10-29.

## Implementation

- [ ] Add per-call evidence context, bounded action history, clocks/freshness/types.
- [ ] Propagate action/journey IDs; instrument dispatch and verification phases.
- [ ] Instrument platform observations, snapshot components, stream device ownership.
- [ ] Register/validate actionRef; preserve compact/debug/image/log responses.
- [ ] Add regression coverage; align tool docs, README, changelog.
- [ ] Review contract, ownership, concurrency, and privacy; complete checks below.

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

Pending implementation and verification.
