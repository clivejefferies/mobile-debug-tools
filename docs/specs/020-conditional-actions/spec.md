# Spec 020: conditional actions

Date: 2026-10-29.
Status: approved — implementation authorised.
Intent: [intent.md](intent.md), approved in the current conversation by the
originator's “yes” in response to the captured intent.

## Outcome

A client can request a supported UI action only if the observed UI snapshot still
matches its expectation. The server obtains a new hierarchy immediately before
native input dispatch. A mismatch prevents input and returns the fresh hierarchy
so the client can decide what to do next.

This is a precondition check, not a guarantee that the UI remains unchanged until
the OS delivers the input or that the action achieves its intended outcome.

## Current code and observations

- `src/server/tool-handlers.ts` wraps action controls, delivery status, response
  modes, and journeys. Existing assertions are separate from native input.
- `ToolsInteract.tapElementHandler` revalidates a handle but does not compare a
  client-provided expected snapshot. Selector resolution can also precede input.
- `src/observe/snapshot-metadata.ts` computes a signature from the full element
  list, screen, and resolution, and assigns revisions per resolved device.
  Revisions remain stable for consecutive identical signatures. State, bounds,
  identities, and actionability contribute; screen fingerprints omit some of
  these and are unsuitable as the only condition.
- Revisions are process-local integers. Revision numbers alone cannot safely
  distinguish server restarts. Error trees may carry a previous revision, so a
  revision on an error response is not proof of a successful observation.
- Android and iOS input adapters mark dispatch immediately before spawning input.
  The new guard must run there, after metadata/capability checks and resolution,
  rather than only at entry to the MCP handler.

### Device reconnaissance (existing behaviour, not feature verification)

Read-only `list_devices` and `get_ui_tree` calls through the connected mobile-debug
MCP succeeded on 2026-10-29:

| Platform | Device | Observed state | Evidence |
| --- | --- | --- | --- |
| Android 16 | `emulator-5554`, sdk_gphone64_arm64 | Modul8 Subscription screen | 18 elements, revision 1, 1280 × 2856, tree call about 4.1 seconds |
| iOS 26.4 | `F72108FF-C8D6-4C1E-980E-1AE5E5CCD27B`, iPhone Air simulator | Home screen | 14 elements, revision 2, 420 × 912, tree call about 8.4 seconds |

These are observations from the connected server; its exact build was not exposed
by these calls. The local checkout declares version 0.32.4. No inputs, installs,
or settings changes were made. Verification must use a build from the changed
checkout; these reads do not establish conditional-action behaviour.

## Initial scope

| Tool | Platforms | Condition support |
| --- | --- | --- |
| `tap` | Android, iOS | Optional expected snapshot |
| `tap_element` (selector or handle) | Android, iOS | Optional expected snapshot |
| `swipe` | Android, iOS | Optional expected snapshot |
| `type_text` | Android | Optional expected snapshot |
| `press_back` | Android | Optional expected snapshot |
| `run_journey` | Android, iOS | Optional condition on each `tap` step |

No platform gains an input capability it does not already support.

Out of scope: lifecycle/build/install/reset tools, `scroll_to_element`,
`adjust_control`, other multi-input operations, arbitrary predicate expressions,
per-element-only conditions, automatic retries/replanning, rollback, screenshot
comparison, and changing post-action verification semantics.

A supplied `expectedState` on any unsupported tool or journey step is rejected
as `INVALID_ARGUMENT` before any operation. It must never be silently ignored.
Conditions cannot be journey defaults or a condition on the journey as a whole.

## Input contract

Add this optional field to each supported tool and journey `tap` step:

```ts
expectedState?: {
  snapshotSessionId: string;
  snapshotRevision: number;
  timeoutMs?: number; // default 15000; integer, 100–60000 ms
}
```

The object is strict. The session ID is nonempty; revision is a positive safe
integer. Invalid types, null, missing required members, extra members, and
out-of-range values return `INVALID_ARGUMENT` before observation or input.
Validate both the advertised JSON schema and actual runtime arguments.

Guarded standalone calls require explicit `platform` and concrete `deviceId`.
The ID must identify the same resolved device as the baseline; aliases such as
`booted` and `default` are not valid guarded targets. Journey taps inherit the
journey's once-resolved concrete platform/device. Unguarded calls retain their
existing device selection and argument behaviour.

### Obtaining an expectation

Successful UI-tree observations add `snapshot_session_id`, a random ID generated
once per server process. Keep existing revision and timestamp fields intact.
Carry the session ID through debug and compact `get_ui_tree` responses and nested
UI-tree evidence. This field does not imply that an error response is usable.

The client takes `snapshot_session_id` and `snapshot_revision` from a successful
`get_ui_tree` on the same device and supplies them as the expectation:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "x": 100,
  "y": 200,
  "expectedState": {
    "snapshotSessionId": "<session from get_ui_tree>",
    "snapshotRevision": 12
  },
  "responseMode": "compact",
  "verificationMode": "none"
}
```

Require a retained successful baseline for this session, device, and revision.
Reuse the existing bounded snapshot history (up to eight revisions, ten-minute
retention); no new unbounded history. Expired, evicted, other-device, or
previous-session baselines cannot authorise input. Clients must observe again.
Check baseline availability before the fresh read and retain its identity for
that check, so the fresh read itself cannot evict the baseline being checked.

## Meaning of expected state

Match means the fresh successful observation's revision equals the retained
expected revision within the same server session and device. Use the existing
snapshot signature and revision rules; do not substitute screen fingerprints,
partial delta history, or target identity alone.

This checks the normalized accessibility snapshot, not every app or OS state.
The signature includes all elements even though retained delta records are
bounded. Existing normalization trims/lowercases string fields, includes state
and bounds, and does not prove the foreground package/activity (current tree
`screen` is empty on both adapters). Pixel-only changes, inaccessible controls,
backend state, and changes hidden by normalization are outside the guarantee.
An intervening observed change followed by a return to the old screen produces
a different revision and is conservatively rejected. An unobserved transient
change cannot be detected. Document these limits in tool usage guidance.

## Dispatch rules

1. Validate the entire condition, supported tool/step, and guarded targeting
   before starting the operation. Resolve and pin the concrete device once.
2. Resolve the requested target and perform existing actionability/capability
   checks. Existing target failures still prevent input normally; an unperformed
   input does not imply its condition was checked.
3. Immediately before the input subprocess would spawn, validate the retained
   baseline and obtain a new, uncached UI hierarchy on the pinned device. Do not
   use a selector-resolution tree, previous assertion, compact delta, or an
   earlier pre-action fingerprint as the final check.
4. Reject error/malformed trees, missing revision/session metadata, or a response
   identifying another device. An old revision on an error tree never passes.
5. Compare the expectation once. No polling until it becomes true, automatic
   rebasing, or retry of input. Existing internal acquisition retries remain
   bounded by the condition timeout; they do not authorise a stale read.
6. On match, record the successful condition result, check the remaining action
   budget, mark dispatch, and spawn native input. No further observation,
   target resolution, metadata lookup, intentional delay, or asynchronous
   capability probe may occur between the final check and input spawn.
7. On failure, preserve the structured condition result across adapter catches.
   Do not mark dispatch or reset the network action window. Skip post-input
   verification and recovery, and return immediately.

The condition observation has its own `timeoutMs` budget. Its elapsed time does
not consume the existing action-dispatch budget; target resolution and input
retain existing action controls. Check a nested budget's outer deadline too
where applicable. An expired condition read cannot permit later background input.
Condition checking is mandatory even with `verificationMode: "none"` or `"light"`.

The guard must be scoped to the request using existing async-context conventions;
it must not leak into another call or recursively guard its own observation.
There is no cross-client transaction or device lock in this initial version.
Concurrent actions, external input, and app updates may still change the UI
after observation; clients should sequence actions on a device. Do not claim
atomicity, exclusivity, or rollback.

## Response contract

Preserve existing action fields. Guarded calls add:

```ts
condition: {
  status: 'matched' | 'mismatch' | 'unavailable' | 'not_checked';
  expected: { snapshot_session_id: string; snapshot_revision: number };
  observed: GetUITreeResponse | null;
  elapsed_ms: number;
  reason?: string;
}
```

Stable `reason` values for unavailable checks: `BASELINE_UNAVAILABLE`,
`SESSION_MISMATCH`, `DEVICE_MISMATCH`, `OBSERVATION_FAILED`,
`OBSERVATION_INVALID`, and `CONDITION_TIMEOUT`. `not_checked` uses
`ACTION_NOT_REACHED` when target/capability failure precedes the guard.
`elapsed_ms` measures the condition check, or zero if it was not reached.

| Outcome | Action result | Delivery fields | Condition evidence |
| --- | --- | --- | --- |
| Match, then input | Existing action outcome | Existing delivery semantics | `matched`, fresh observed tree |
| State differs | `success: false`, `failure_code: PRECONDITION_FAILED`, `retryable: false` | `dispatch_started: false`, `delivery_status: not_delivered`, `lifecycle_state: failed` | `mismatch`, exact fresh observed tree |
| Check cannot be completed | `success: false`, `failure_code: PRECONDITION_UNAVAILABLE`, `retryable: false` | Same non-delivery fields | `unavailable`, reason; valid fresh tree if available, otherwise null |
| Target/capability failure before check | Existing failure code | No input dispatch | `not_checked`, observed null |

For blocked input, `verification.status` is `not_requested`; this is a failed
precondition, not a failed post-action assertion. If input fails after a match,
retain `matched` alongside the actual input failure; a matching condition is not
proof of delivery or outcome correctness. Add failure codes to shared types and
recovery handling without enabling automatic retry.

Debug mode includes full condition evidence. Compact mode always keeps condition
status, expected values, elapsed time, and reason. On mismatch/unavailable it also
keeps `observed`, including the full tree when available: this is a documented
exception to compact mode's usual omission of device IDs and tree contents.
On match, compact mode keeps only observed snapshot session/revision and capture
time instead of the full tree. `not_checked` keeps observed null.

The returned mismatch tree is the actual observation that blocked input; do not
replace it with a later snapshot. No automatic screenshot or log capture is
required. Apply existing response-data handling; UI trees can contain private
text. Do not log expectation payloads, input text, or full trees by default.

## Journey behaviour

A conditional tap uses the same guard as a standalone `tap_element`. Conditions
are evaluated at that step's dispatch boundary, after any earlier waits/asserts.
A mismatch or unavailable condition fails that step and sets
`stopped_at_step_id`; subsequent steps are `not_run`. Earlier completed steps
remain completed. Preserve condition evidence in both journey response modes,
regardless of `captureOnFailure`. Existing optional debug failure snapshots must
not overwrite the guard evidence. There is no rollback or implicit baseline
refresh from an earlier step.

## Acceptance criteria

1. Matching expectations dispatch exactly once on every supported tool/platform;
   existing post-action controls still apply.
2. A changed text, bounds, enabled flag, or exposed element state blocks input
   even when the target still exists; return the blocking observation.
3. Detect a change after selector resolution and during adapter preparation by
   checking at the final dispatch boundary, not only at handler entry.
4. Old sessions, expired/evicted baselines, another-device baselines, failed
   observations, malformed metadata, and condition timeout never dispatch input.
5. Conditions are enforced in none/light/full verification and compact/debug
   response modes; mismatch evidence survives compact serialization.
6. A failed journey condition stops subsequent steps and preserves earlier results.
7. Unsupported/malformed conditions fail validation before side effects.
8. Unguarded calls preserve existing contracts and behaviour.
9. Concurrent requests do not share guard state; blocked input neither resets
   the network window nor triggers retry/recovery. No late dispatch after timeout.
10. Documentation explains snapshot normalization, history/session limits,
    additional observation latency, data exposure in mismatch responses, and the
    observation-to-input race.

## Affected surfaces and verification expectations

Implementation is expected in tool definitions and runtime validation, action
wrapping/serialization and journey schema, snapshot metadata/history and types,
and the Android/iOS native input boundaries. Reuse existing async contexts,
budgets, and device resolution. Keep platform subprocess logic in its adapters.
Update interaction/observation docs, README usage, changelog, and packaged agent
skill guidance if it describes the new workflow; use the existing plugin sync
command when changing its source.

Use the repository's self-running `tsx` unit tests to prove dispatch prevention,
freshness ordering, error propagation, exact evidence, isolation, timeout, and
schema parity. Exercise real adapter paths with controlled subprocess fixtures;
a test that mocks away the guard boundary is insufficient.

Run `npm run verify` and `npm run test:device` after implementation, plus focused
Android and iOS simulator journeys using the newly built server. Use an isolated
test app or safe system controls, avoiding changes to the currently open Modul8
subscription flow. Verify an unchanged-state action, deliberate intervening
state change with non-delivery, and journey stop. Use controlled failures for
unavailable/timeout and race ordering; report simulated and device evidence
separately. Record exact test routes and cleanup in the implementation plan.

## Risks and decisions

- Whole-tree changes may conservatively block an action due to unrelated dynamic
  UI; this initial version favours explicit rejection. Per-element predicates
  can be specified later if needed.
- Hierarchy acquisition adds seconds to guarded input; the separate condition
  budget is intentional and must not silently weaken freshness.
- Returning a fresh hierarchy in compact failures increases payload size and
  exposes the same UI text as `get_ui_tree`; callers must handle it accordingly.
- Session metadata is an additive contract change. Older servers cannot accept
  guarded calls; clients must obtain expectations from this supporting server.
  Local tests are not proof of an installed or published version's behaviour.
- No data migration, new dependency, helper APK, external service, or automatic
  release is required. Package publication remains a separate authorised action.

## Approval

Approved by the originator on 2026-10-29 in the current conversation: “yes”,
in direct response to the linked complete spec and the listed first-version
scope. Implementation is authorised within that scope.
