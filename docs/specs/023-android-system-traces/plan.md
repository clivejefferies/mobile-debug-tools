# Plan: Android system traces

[Design and evidence](../../README.md#design-and-evidence) · [Tool reference](../../tools/TOOLS.md) · [Intent](intent.md) · [Specification](spec.md)

Authorised by [intent](intent.md) (“yes”) and [specification](spec.md)
(“looks good”, followed by “great”), 2026-10-30 during design review.

## Implementation

- [x] Implement ADB capability/capture adapter with PID identity and bounded files.
- [x] Implement serialised sessions, deadlines, retries, retention and shutdown.
- [x] Register strict schemas/tools, link journeys and propagate trace evidence.
- [x] Add regression/device tests and align README/tool docs/changelog.
- [x] Review ownership/failure/concurrency/contracts; run verification below.

Use existing device resolver, ADB path helper, execution helper and async-local
evidence context. Node >=18; CI uses Node 18 and local runtime is recorded below.
No installation, publishing, commit or push is required. Android CLI absent;
ADB/Perfetto available on emulator-5554 API 36. Inspect trace content with a local
parser or Perfetto UI; missing viewer/parser blocks artifact-format proof, not
implementation. Avoid downloading tooling without need.

## Verification

| Criteria | Evidence |
| --- | --- |
| 1 capability/no side effects | Fake adapter/ADB tests, strict runtime/registration schemas, iOS rejection. |
| 2 artifact/correlation | Updated stdio server: emulator start, Settings journey, stop, nonempty bounded artifact and Perfetto content inspection. |
| 3 lifecycle/isolation | Deterministic injected adapter/clock tests: duration, cancel, repeated controls, contention, stale IDs, reused PID, concurrent devices. |
| 4 failures/cleanup | Tests: missing tool/service, start/stop/pull timeout, disconnect, partial transfer, shutdown and mismatch without journey dispatch; real cancel/expiry. |
| 5 compatibility | Existing unit/device suites and additive schema/serialization assertions. |

Commands: `node --import tsx test/unit/observe/system-trace.test.ts`,
`node --import tsx test/unit/server/system-trace.test.ts`, `npm run verify`,
`npm run test:device`. Local verify adds plugin checks beyond CI; CI device
workflow is manual and Android API 30, local suite additionally requires iOS.

Device smoke: fresh discovery, explicit Android emulator, rebuilt 0.33.0 stdio
server. Start in Settings; capture a start_app Settings journey; assert identifiers,
state, artifact size and cleanup. Repeat cancellation, duration expiry and invalid
journey reference. Inspect resulting Perfetto packets; save metadata only in this
directory. Remove test-owned host artifacts; no app data/settings changes. State
pass/fail/blocked/unrun, build hash, device and gaps. Physical-device capture and
installed/published package remain separate from emulator evidence.

## Results

Implementation and focused review completed on 2026-10-30, based on
`a74238b`. The results below cover the local build, not a published package.

- Local runtime: Node 23.11.0 / npm 10.9.2. CI's Node 18 runtime remains **unrun**
  locally; the final CI workflow was not invoked. Existing CI uses Node 18 and
  manual Android API 30 integration; local device evidence uses API 36.
- Focused session, Android adapter and tool/journey contract checks: **pass**.
  Cover strict input/error flags, unsupported iOS/no dispatch, missing native
  prerequisites, bounded capture, successful transfer permissions, cancellation,
  automatic duration completion, failed/empty/oversized/partial transfers,
  stop/start timeouts, unavailable devices, retry, PID reuse, naturally exiting
  processes, simultaneous control calls, parallel devices, active shutdown,
  shutdown racing start, metadata expiry/eviction and trace evidence isolation.
- `npm run verify`: **pass** on the final code (68 unit files, lint, TypeScript
  build, plugin consistency). The tsx CLI requires local IPC
  blocked by the sandbox, so the required command ran with approved escalation.
- `npm run test:device`: **pass** on the final runtime code, eight smoke files.
  Existing Android/iOS screenshot, tree, log and correlation checks pass; correlation
  pins emulator-5554 and iPhone 17 Pro simulator
  F9243BAF-62A8-4990-8A99-17F527F56FDA (iOS 26.4). The six older platform smokes use
  automatic targeting and do not all identify the selected device.
- Focused updated stdio-server trace journeys: **pass** on Android 16
  emulator-5554, local package 0.33.0. Final combined runtime hash:
  `f59ec5112751295517ce3fd6fafe78e06ca009f30ecfcc560c872bfbf1cf86ee`.
  Fresh Settings baseline, traced launch and semantic assertion of a visible
  Settings-owned resource, matching trace/journey/step IDs, local artifact,
  idempotent stop, inactive reference rejection, cancellation, 1,001 ms duration
  expiry, and closing another server during active capture all pass.
- Artifact format/content: **pass** using the local protobuf decoder: complete
  Trace.packet boundaries, embedded requested duration, timestamped ftrace events
  and compact scheduler bundles. Final full-suite artifact: 870,332 bytes,
  227 packets, 19,833 timestamped events and 210 compact scheduler bundles.
  This is structural/content evidence, not full Perfetto UI/SQL analysis.
- Device metadata is in [device-evidence.json](device-evidence.json), without
  trace contents, UI text, screenshots or logs. Test-owned device/host capture
  artifacts are removed. No device settings or app data changed; Settings remains
  foreground. Final device-directory inspection confirms no test trace files
  remain. The first shutdown regression test's bounded leftover file was
  removed individually after confirming its process had exited.
- Review corrected stdin-end cleanup (the SDK does not emit transport close on
  stdin EOF), process-exit races around identity reads/SIGTERM, error flags for
  unsupported action-control fields, and conservative journey coverage when
  capture state becomes unavailable. Unreadable/reused live identity still fails
  closed. No outstanding findings in the implemented scope.
- The initial extra UI assertion expected a Settings title, but Settings resumed
  Network & internet. The smoke now establishes a fresh Settings-owned resource
  baseline and proves that element is visible during the journey. No assertion
  was removed, and no fixture settings were changed.
- Physical Android capture, actual unplug/disconnect and hard-crash recovery:
  **unrun**; deterministic adapter/session failure coverage passes. iOS tracing is
  explicitly unsupported, with rejection tested. Installed/published-package and
  full trace-analysis verification remain **unrun**.

Changed documentation links, evidence JSON and whitespace checks pass.

## Emulator recheck — 2026-10-30

User requested a fresh emulator test. Rebuilt with `npm run build` (**pass**),
then ran `SYSTEM_TRACE_EVIDENCE_PATH=docs/specs/023-android-system-traces/emulator-recheck.json node --import tsx test/device/automated/observe/system-trace.smoke.ts`
on emulator-5554, Android 16, local stdio server 0.33.0, same runtime hash as above.
**Pass:** fresh Settings UI baseline, traced launch and semantic visibility
assertion, correlated IDs, nonempty Perfetto artifact with timestamped kernel and
scheduler content, repeated stop, inactive reference rejection, cancellation,
1,001 ms expiry, and active-capture server shutdown cleanup. Artifact: 996,053
bytes, 230 packets, 23,054 timestamped ftrace events. Test-owned host/device trace
files removed; no settings or app data changed. Settings remains foreground.
Metadata: [emulator-recheck.json](emulator-recheck.json). Full Perfetto analysis,
physical devices and failure-by-unplug were not part of this recheck.
