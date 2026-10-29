# Plan: conditional actions

Date: 2026-10-29. Status: complete — implementation and required verification passed.
Intent: [intent.md](intent.md). Specification: [spec.md](spec.md).
Both approved by the originator's separate “yes” replies in this conversation;
the latest approval authorises implementation of spec 020.

## Implementation sequence

- [x] Inspect action wrapping, native input, observation/history, budgets, tests.
- [x] Add session metadata and retained successful-baseline lookup without changing
  existing revision semantics or growing history.
- [x] Add strict condition schema, supported-tool validation, and journey tap wiring.
- [x] Add a request-scoped asynchronous pre-dispatch guard, pin the device, and
  isolate the observation budget from the action budget (respecting outer budgets).
- [x] Integrate at Android/iOS input spawn boundaries; retain failure evidence
  through adapter errors; defer guarded network-window reset until dispatch.
- [x] Preserve condition evidence and non-delivery semantics in compact/debug
  responses, including journey stop and not-checked cases.
- [x] Add deterministic unit/adapter regression coverage and device journeys.
- [x] Update public docs/changelog and packaged agent usage guidance; sync/check plugin.
- [x] Run focused checks, maintainer verification, device suite, and focused device journeys.
- [x] Review changed code/contracts/callers and record results and limits.

## Expected affected files

- `src/observe/snapshot-metadata.ts`, `src/observe/index.ts`, `src/types.ts`.
- New shared condition schema/guard modules under `src/` as responsibility requires.
- `src/utils/operation-budget.ts`, Android/iOS input adapters.
- `src/server/tool-definitions.ts`, `tool-handlers.ts`, `journey-schema.ts`, `common.ts`.
- Unit tests under `test/unit/server/`, `test/unit/observe/`, and adapter fixtures.
- Focused reusable device helper under `test/device/manual/` if explicit simulator
  selection/state setup makes it unsuitable for automatic generic suite execution.
- `docs/tools/interact.md`, `observe.md`, `docs/CHANGELOG.md`, `README.md`, and
  `agent-plugin/skills/mobile-debug-mcp/SKILL.md`.

## Verification mapping

| Spec criteria | Verification |
| --- | --- |
| 1, 5, 8 | Real Android/iOS adapter calls using fake binaries; all supported actions, verification modes and response modes; unguarded compatibility tests |
| 2, 3 | Mutable hierarchy fixture changes text/bounds/enabled/state and changes during target resolution/adapter preparation; assert zero native input and exact final tree |
| 4 | Session, history expiry/eviction, device mismatch, error/malformed observation, timeout including late completion and child cleanup |
| 6 | Journey with earlier passed step, blocked conditional tap, later not-run step; both response modes |
| 7 | Runtime invalid-input matrix and advertised schemas; unsupported tools/steps rejected before any side effects |
| 9 | Overlapping guarded/unguarded calls and network-window reset spy; condition budget distinct from input budget; outer-budget expiry |
| 10 | Documentation and focused review against actual implementation |

Commands: focused test files via existing `tsx` runtime, then `npm run verify`,
`npm run test:device`, and focused device helper against built `dist/` modules.
Runtime: repository supports Node >=18; record actual Node/toolchain with results.
No new dependency, migration, helper APK, publication, or service is needed.

## Device routes and readiness

Available during spec reconnaissance: Android 16 `emulator-5554` and booted iOS
26.4 iPhone Air `F72108FF-C8D6-4C1E-980E-1AE5E5CCD27B`. The physical Pixel is
excluded from mutation checks. Tool access and fresh trees work on both simulators.
Before device runs, inspect current state and choose safe system controls; avoid
interacting with the open Modul8 subscription flow. Use an already-installed
system Settings app on Android/iOS where possible; no accounts or entitlements.

For each platform on the newly built server:

1. Open system Settings, observe its tree and session/revision, repeat to check a
   stable baseline, then perform a guarded safe navigation tap and assert destination.
2. Observe the baseline, navigate to another Settings screen, then send a guarded
   action with the old expectation; assert non-delivery and returned current tree.
   Confirm the blocked action has no effect using a fresh state assertion.
3. Run a journey with an earlier successful wait/assert, an old-revision guarded
   tap, and a later action. Confirm the tap fails, later step is not run, and state
   stays unchanged. Repeat relevant compact/debug evidence checks.

Exact selectors depend on the current simulator OS tree and will be recorded
with results. Restore original foreground apps where practical; do not alter
settings, app data, or subscriptions. Owner of local prerequisites: current task.
Unavailable/timeout and last-moment preparation races use controlled fake binaries;
no forced device disconnect or privileged settings change is needed. This is
reported as simulated error-path evidence, separate from real-device passes.

## Results

Implementation is present. Node.js v23.11.0 was used locally (the supported
minimum is >=18; CI's Node 18 run has not been executed locally).

### Automated checks

- Initial `npm run verify`: PASS, including lint, build, unit tests, plugin check.
- Focused conditional action regression: PASS using production Android/iOS input
  adapters and controlled fake native binaries. Coverage includes all supported
  actions, each verification/response mode, late target-preparation changes,
  mismatches, unavailable/malformed observations, session/history/device rejection,
  request isolation, native input failure, and journey stop. Complete native
  observation/input paths also pass with fake ADB/idb, including child-close
  evidence for condition timeouts. This is simulated platform evidence.
- Focused schema parity and retention tests: PASS. Advertised JSON schemas are
  exercised using the existing MCP SDK's validator, alongside runtime schemas.
  All elements contribute to revision checks beyond the bounded delta history.
- `npm run sync:agent-plugin`: PASS; no generated manifest differences.
- Final `npm run verify`: PASS (lint, build, 59 unit-test files, plugin consistency).
  Log: `/tmp/mobile-debug-conditional-verify-final.log`.
- Initial `npm run test:device`: FAIL at iOS UI-tree smoke (`Invalid UI tree resolution`) while the original simulator was booting.
  Android screenshot/log/tree wrappers passed. iOS screenshot wrapper passed;
  the iOS log wrapper also reported pass but its underlying log retrieval printed
  `getpwuid_r` / unavailable log-store errors, so this is not evidence of usable
  iOS logs. These wrappers use automatic device selection; focused tests below
  pin their simulator explicitly. Full log: `/tmp/mobile-debug-conditional-device-suite.log`.

- Final `npm run test:device`: PASS after the replacement iPhone 17 Pro finished
  booting. All six Android/iOS screenshot, log, and tree smoke wrappers passed,
  without the earlier iOS log-store diagnostics. Log:
  `/tmp/mobile-debug-conditional-device-suite-final.log`.
- Final documentation relative-link checks and `git diff --check`: PASS.
- Final lint after the device helper's selector/start-state correction: PASS.

### Focused Android emulator evidence

Command (against the built server over MCP stdio, no mocked tool handlers):

```sh
node --import tsx test/device/manual/interact/conditional_actions.manual.ts \
  --platform android --id emulator-5554 \
  --target-text 'Network & internet' --destination-text Internet \
  --output /tmp/mobile-debug-conditional-android.json
```

Device: Android 16 sdk_gphone64_arm64, `emulator-5554`.
Build: local `dist/server.js`, handshake `mobile-debug-mcp` 0.32.4, with
`expectedState` confirmed in its advertised tool schema. This is the working-tree
build, not proof of a published release.
Starting state: system Settings root, with Network & internet visible.

| Journey | Actions / expected outcome | Observed outcome | Result |
| --- | --- | --- | --- |
| Matching snapshot | Observe Settings; conditional coordinate tap Network & internet | `matched`, delivered once; fresh tree contains Internet | PASS |
| Stale snapshot, compact | On network page, attempt safe back-navigation tap with root expectation | `PRECONDITION_FAILED`, not delivered; compact tree contains Internet; fresh tree confirms network page remains | PASS |
| Stale snapshot, debug | Repeat guarded back navigation with root expectation | Same non-delivery and unchanged destination, full debug evidence | PASS |
| Journey stop, compact | Successful wait for Internet, conditional back tap with root expectation, later tap | Earlier wait passed, guarded step failed with fresh tree, later step `not_run`; destination remained | PASS |
| Journey stop, debug | Same sequence in debug mode | Same stop and preserved evidence | PASS |

Full structured evidence: `/tmp/mobile-debug-conditional-android.json`.
The five scenarios were rerun successfully against the final built server after
the compact-error and metadata-validity fixes and the helper selector correction.
The helper is reproducible and requires a deliberately prepared safe system
Settings screen. No setting or subscription was changed. The original Modul8
dev app was brought back to the foreground after checks.

### Focused iOS simulator evidence

The original iPhone Air simulator stalled during boot and was closed/rebooted by
the user. The replacement iPhone 17 Pro became responsive; read-only screenshot
and UI-tree checks confirmed Home and then Settings before running input checks.
No boot/restart/reset commands were issued by the agent.

Command:

```sh
node --import tsx test/device/manual/interact/conditional_actions.manual.ts \
  --platform ios --id F9243BAF-62A8-4990-8A99-17F527F56FDA \
  --target-text General --destination-text About \
  --output /tmp/mobile-debug-conditional-ios.json
```

Device: iOS 26.4 iPhone 17 Pro simulator,
`F9243BAF-62A8-4990-8A99-17F527F56FDA`.
Build: the same local `dist/server.js` 0.32.4 build and MCP stdio route as Android,
with condition support confirmed in tool discovery.
Starting state: Settings root with General visible, About absent.

| Journey | Actions / expected outcome | Observed outcome | Result |
| --- | --- | --- | --- |
| Matching snapshot | Observe Settings; conditional coordinate tap General | `matched`, delivered; fresh tree contains About | PASS |
| Stale snapshot, compact | Attempt safe back-navigation tap with Settings-root expectation | `PRECONDITION_FAILED`, not delivered; compact fresh tree contains About; new observation confirms General stays visible | PASS |
| Stale snapshot, debug | Same guarded back navigation | Same non-delivery and preserved full condition tree | PASS |
| Journey stop, compact | Successful wait for About, stale conditional tap on `resource_id: BackButton`, later back tap | Wait passed; condition failed; later step `not_run`; General remained visible | PASS |
| Journey stop, debug | Same sequence in debug mode | Same stop and fresh condition evidence | PASS |

Structured evidence: `/tmp/mobile-debug-conditional-ios.json`.
An initial helper attempt selected the application container sharing the Settings
label and correctly stopped with `ELEMENT_NOT_INTERACTABLE` / `not_checked`;
this was not counted as a conditional-journey pass. The helper now prefers the
unique native resource ID and requires the destination to be absent from its
starting screen. A subsequent incorrect-start attempt was also discarded.
The final five-pass run above starts at the confirmed root and uses BackButton.

Cleanup: only navigation was exercised. No setting, permission, account, or app
data was changed. Home is restored after the smoke-suite rerun.

### Focused quality review

Reviewed the shared condition schema and advertised definitions, action wrapper
and journey dispatch, Android/iOS native input boundaries, observation metadata
and history, budget ancestors, compact serialization, error/recovery mapping,
and associated tests/callers. The guard runs after adapter preparation, and
blocked conditions replace generic adapter failures without inventing an execute
trace or allowing recovery. Condition observation budgets pause only the current
action; enclosing deadlines still apply. Tests check no late input after timeout
and native observation child closure. No new framework or dependency was added.

Review findings fixed:

- Journey light-verification response overlay must preserve `not_requested` when
  its conditional tap did not dispatch.
- Compact tree responses must retain observation errors instead of looking like
  successful deltas carrying an old revision/session. Added a regression test.
- Repeated successful observations refresh retained revision timestamps, so a
  recently observed stable screen does not yield an immediately unusable baseline.

Limits: live simulator checks cover conditional taps and journey stops; conditional
swipes and Android typing/back use production-adapter tests with fake native
tools. Physical devices were not used for mutation checks. UI normalization, the observation-to-OS-input race, and concurrent external
input remain explicit spec limits. No mutation testing was performed. No tests
or validation rules were weakened. Existing uncommitted process/skill relocation
work was preserved. No package was published and nothing was committed/pushed.
