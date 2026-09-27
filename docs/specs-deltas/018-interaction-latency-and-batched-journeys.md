# RFC 018 — Interaction Latency, Verification Modes, and Batched Journeys

## Status

Implemented; Android validation passed. iOS device validation pending.

## 1. Summary

This RFC reduces mobile-debug MCP round-trip latency while retaining an explicit path to the current verification guarantees.

It adds optional execution controls to action tools, compact responses, selector-based tapping, state-delta observations, and a batched `run_journey` tool. Existing callers remain compatible: omitted controls retain the current full verification and detailed response behavior.

## 2. Problem

The current path performs more device work and returns more data than most interaction turns need.

- `start_app` captures a screen fingerprint before and after launch, in addition to the launch adapter's current-screen observation.
- Coordinate actions capture fingerprints before and after dispatch.
- `tap_element` captures a fingerprint, re-reads the full UI tree to revalidate a stored handle, dispatches, then captures another fingerprint.
- `capture_debug_snapshot` always starts a screenshot collection, even when the caller needs only hierarchy or logs.
- A normal agent journey requires separate resolve, tap, wait, expect, and snapshot calls, each with a protocol round trip and repeated device metadata.

These checks are valuable when diagnosing an ambiguous result. They are unnecessary for every known-safe, immediately-followed step, and they make the server appear slow even when device execution is prompt.

## 3. Goals

1. Make the latency of `start_app`, `tap_element`, `wait_for_ui`, `capture_screenshot`, and `capture_debug_snapshot` measurable and reportable.
2. Let callers choose `none`, `light`, or `full` verification per interaction without weakening the compatibility default.
3. Make normal responses small and use `debug` only when detailed traces and device metadata are needed.
4. Resolve and tap a selector in one server request.
5. Run ordered interaction journeys in one device session and stop at the first failed assertion.
6. Return changed accessibility nodes rather than repeated complete trees when a prior snapshot is available.
7. Use UI evidence as soon as it is available; do not add a fixed settling delay after a fresh expected state is observed.

## 4. Non-goals

- Changing the meaning of existing `expect_*` tools or their stabilization rules.
- Inferring app-specific expected outcomes when the caller has not supplied one.
- Removing `capture_screenshot` or the detailed debug snapshot.
- Bypassing target actionability checks for selector-based actions.
- Making `none` appropriate for actions with an asserted business outcome.
- Reporting benchmark figures without a controlled device run.

## 5. Compatibility and defaults

All new inputs are optional. For every existing action request:

```text
verificationMode = "full"
responseMode = "debug"
```

is the effective behavior. Existing response fields, including action envelopes, fingerprints, device metadata, and traces, remain available in that mode. No existing tool is removed or renamed.

New clients SHOULD use `responseMode: "compact"` and select the least costly verification mode that satisfies their next decision. `full` remains required for a final assertion unless that assertion is separately expressed as an `expect_*` or journey assertion.

## 6. Common interaction controls

The following optional properties are added to `start_app`, `restart_app`, `tap`, `tap_element`, `swipe`, `scroll_to_element`, `type_text`, and `press_back`. A tool that cannot apply a field MUST reject it with `INVALID_ARGUMENT`, rather than silently changing its semantics.

```ts
verificationMode?: "none" | "light" | "full" // default: "full"
responseMode?: "compact" | "debug"            // default: "debug"
actionTimeoutMs?: number                         // adapter dispatch limit
verificationTimeoutMs?: number                   // verification budget
```

Values are finite integers. `actionTimeoutMs` is clamped to 100–30,000 ms, and `verificationTimeoutMs` to 100–60,000 ms. The server reports effective values in debug responses. Platform adapters MUST receive and enforce `actionTimeoutMs`; it must not be a cosmetic field.

Unless supplied, the effective dispatch budget is 5,000 ms and the effective light-verification budget is 3,000 ms. `start_app` has a 10,000 ms dispatch default because launch includes an adapter-owned foreground check. `restart_app` has a 15,000 ms total dispatch budget: at most 5,000 ms for termination and the remaining budget, capped at 10,000 ms, for launch. `scroll_to_element` has a 10,000 ms total dispatch budget; the budget covers every scroll and resolve attempt, so no attempt may start after its deadline. Existing `full` calls retain their present adapter and stabilization behavior when the fields are omitted; a supplied budget bounds only work introduced by this RFC.

The server creates one deadline at dispatch start and passes its remaining duration to each nested operation. It cancels local polling and child processes when the deadline expires. A timeout before the command is issued is `ACTION_TIMEOUT`, `success: false`, `delivery_status: "not_delivered"`, and `retryable: true`. A timeout after dispatch begins is `ACTION_TIMEOUT`, `success: false`, `delivery_status: "unknown"`, and `retryable: false`: the device may have acted, so the client MUST observe state before retrying. The response includes `dispatch_started: boolean` and elapsed timing in both response modes.

### 6.1 Verification modes

| Mode | Required work | Result meaning |
|---|---|---|
| `none` | Resolve only when required to dispatch; issue the command. No post-dispatch UI read. | `success` means the adapter accepted the action. |
| `light` | Dispatch, then take one fresh accessibility-tree observation. | `success` means delivery succeeded; `state_delta` is best-effort evidence, not a passed assertion. |
| `full` | Preserve the current tool's pre/post evidence, stale-reference checks, stabilization, and trace behavior. | Existing meaning is unchanged. |

`light` MUST not wait for an arbitrary settling interval. It MAY poll only until the first fresh observation arrives, bounded by `verificationTimeoutMs`. If the observation cannot be obtained in time, return `success: true`, `verification.status: "unavailable"`, and a retryable verification diagnostic; do not recast a delivered action as a dispatch failure. `verification.status: "unavailable"` is therefore a successful action with incomplete evidence, never a failed action.

`none` and `light` return `lifecycle_state: "pending_verification"` after delivery. `full` retains current lifecycle-state behavior.

### 6.2 Response modes

`debug` preserves the existing response shape. It includes device metadata, full action trace, fingerprints, resolved target detail, timing breakdown, and adapter diagnostics when present.

`compact` returns only:

```ts
{
  action_id: string,
  action_type: string,
  success: boolean,
  lifecycle_state: "pending_verification" | "verified" | "failed",
  failure_code?: string,
  retryable?: boolean,
  delivery_status?: "delivered" | "not_delivered" | "unknown",
  dispatch_started: boolean,
  verification?: { mode: "none" | "light" | "full", status: "not_requested" | "observed" | "verified" | "unavailable" | "failed" },
  state_delta?: StateDelta,
  timing: { total_ms: number }
}
```

The compact form MUST retain failure and retry information. It MUST NOT emit device identifiers, full tree contents, raw adapter output, screenshots, fingerprints, or trace steps. A client can repeat an action only with a new `responseMode: "debug"`; it cannot expand a past compact result.

## 7. Selector-based tap

`tap_element` accepts exactly one of the existing `elementId` or a new `selector`; this does not change the `elementId` path.

```ts
selector?: {
  text?: string,
  resource_id?: string,
  accessibility_id?: string,
  contains?: boolean
}
waitFor?: {
  condition?: "exists" | "visible" | "clickable",
  timeoutMs?: number,       // default 1,500; range 100–10,000
  pollIntervalMs?: number   // default 100; range 50–1,000
  match?: { index?: number }
}
```

With a selector, the server resolves a fresh UI tree, verifies that the selected node is actionable, and taps it in the same request. `waitFor` means wait for the target before resolving; it is not post-tap verification. Without `waitFor`, resolution occurs once and fails with `ELEMENT_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `ELEMENT_NOT_INTERACTABLE` as applicable. A selector match must use the same matching and index semantics as `wait_for_ui`.

When `verificationMode: "full"`, selector resolution replaces the separate client resolve call but does not skip required post-action verification. The resolved element returned in debug mode includes only the selected node, never the complete tree.

## 8. State-delta snapshots and screenshot policy

The snapshot metadata layer already tracks stable node identities and aggregate change counts. It is extended to retain the prior normalized node record by device and expose changed nodes.

```ts
type StateDelta = {
  base_snapshot_revision: number | null,
  snapshot_revision: number,
  added: UIElement[],
  removed: Array<{ stable_id?: string, resourceId?: string, contentDescription?: string, text?: string, index: number }>,
  changed: UIElement[],
  truncated: boolean
  omitted_changes?: number
}
```

For each `(platform, deviceId)`, the server retains normalized node records for the latest eight revisions or ten minutes, whichever expires first. It retains at most 500 nodes per revision. A delta contains at most 200 changed nodes; additional changes set `truncated: true` and report `omitted_changes`. Revision state is process-local and is discarded on server restart, device disconnect, or retention expiry.

`get_ui_tree` adds `responseMode` and `sinceSnapshotRevision`:

- `responseMode: "debug"` remains the complete tree response.
- `responseMode: "compact"` with a matching `sinceSnapshotRevision` returns `state_delta`; it does not include unchanged nodes.
- `responseMode: "compact"` without `sinceSnapshotRevision` returns `{ delta_available: false, snapshot_revision }` and no nodes. The caller obtains a base with a debug tree.
- If the requested base revision is unavailable, return `{ delta_available: false, snapshot_revision, reason: "BASE_REVISION_UNAVAILABLE" }` and no nodes. The client recovers by requesting a debug tree, then resumes from its returned revision.
- A truncated delta is valid only as a change signal. The client MUST request a debug tree before using it to make a target-selection decision.

For a `light` action, the server takes exactly one post-dispatch tree. It computes `state_delta` against the most recent retained revision for the same device, if one exists; otherwise it returns `state_delta: undefined` and `state_delta_available: false`. It never takes a pre-dispatch tree merely to create a delta. The returned `base_snapshot_revision` tells the client whether its local state can safely apply that delta.

Within `run_journey`, an immediately following `element_visible` assertion may supply that fresh post-dispatch tree for a `light` tap. The tap reports `verification.status: "observed"` when the assertion returns a matched count, even if the assertion fails; it reports `"unavailable"` with a retryable diagnostic if the observation cannot be confirmed.

`capture_debug_snapshot` adds `includeScreenshot?: boolean`, defaulting to `true` for compatibility. New compact callers MUST set it explicitly; `includeScreenshot: false` collects no screenshot. `capture_screenshot` remains the explicit screenshot tool. No interaction tool captures a screenshot unless its request explicitly asks for one through its observation configuration.

## 9. `run_journey`

`run_journey` runs a bounded ordered sequence against one resolved platform and device. It avoids MCP round trips; it does not hold a cross-request device lock or conceal failures.

```ts
{
  platform: "android" | "ios",
  deviceId?: string,
  responseMode?: "compact" | "debug", // default compact
  captureOnFailure?: boolean,            // default false
  defaults?: { verificationMode?: "none" | "light" | "full", actionTimeoutMs?: number, verificationTimeoutMs?: number },
  steps: Array<
    { id: string, type: "start_app", appId: string, verificationMode?: VerificationMode } |
    { id: string, type: "wait", selector: Selector, condition?: "exists" | "not_exists" | "visible" | "clickable", timeoutMs?: number, pollIntervalMs?: number } |
    { id: string, type: "tap", selector?: Selector, elementId?: string, waitFor?: WaitFor, verificationMode?: VerificationMode } |
    { id: string, type: "assert", assertion: ElementVisibleAssertion | ElementAbsentAssertion | ScreenFingerprintAssertion | StateEqualsAssertion, timeoutMs?: number, pollIntervalMs?: number }
  >
}
```

```ts
type ElementVisibleAssertion = { kind: "element_visible", selector: Selector }
type ElementAbsentAssertion = { kind: "element_absent", selector: Selector }
type ScreenFingerprintAssertion = { kind: "screen_fingerprint", fingerprint: string }
type StateEqualsAssertion = {
  kind: "state_equals",
  property: string,
  expected: boolean | number | string,
  selector?: Selector,
  elementId?: string
}
```

Step IDs must be unique. Maximum steps: 50. A journey validates its complete schema before device work begins. `tap` requires exactly one target. `state_equals` requires exactly one of `selector` or `elementId`; every other assertion rejects irrelevant fields. `start_app` is the journey equivalent of `start_app`.

Journey assertions use a 5,000 ms timeout and 100 ms poll interval unless supplied; their ranges are 100–60,000 ms and 50–1,000 ms. `element_visible` is the existing `expect_element_visible` predicate. `element_absent` is a new journey-only predicate: zero matching nodes must be seen in two fresh trees at least 100 ms apart, within the assertion timeout. `screen_fingerprint` matches the current fingerprint on two consecutive reads 100 ms apart. `state_equals` uses the existing `expect_state` stabilization contract, with the journey's supplied or default timeout and poll interval applied as that contract's budget and observation interval; it does not add a second two-read rule. Assertions return `ASSERTION_TIMEOUT` on budget expiry and include the last observed value or matched count. A `wait` remains synchronization, not proof of a business outcome.

The journey resolves the platform and device once before the first step and passes that exact context to every step. An `elementId` is valid only when its stored platform and device ID equal the journey context. A mismatch is `STALE_REFERENCE`, no tap is dispatched, and the journey stops.

The response is:

```ts
{
  success: boolean,
  stopped_at_step_id: string | null,
  steps: Array<ExecutedJourneyStep | NotRunJourneyStep>,
  timing: TimingBreakdown
}

type ExecutedJourneyStep = {
  id: string, type: string, status: "passed" | "failed",
  success: boolean, result: CompactOrDebugStepResult, timing: TimingBreakdown
}
type NotRunJourneyStep = {
  id: string, type: string, status: "not_run", success: false,
  reason: "PREVIOUS_STEP_FAILED", result: null, timing: { total_ms: 0 }
}
```

It stops immediately after a failed assertion, failed wait, target-resolution failure, or dispatch failure. Later steps have the `NotRunJourneyStep` shape and are never attempted. An action with `verification.status: "unavailable"` has `status: "passed"` because dispatch succeeded; a following assertion decides whether its intended outcome occurred. Debug mode includes the failing step's trace and a snapshot only when `captureOnFailure: true` is passed at journey level. The failure snapshot has `includeScreenshot: false` unless the caller separately requests a screenshot.

## 10. Timing measurement and reporting

Every specified tool records monotonic durations; wall clock is used only for timestamps. The timing schema is additive:

```ts
type TimingBreakdown = {
  total_ms: number,
  device_resolution_ms?: number,
  pre_observation_ms?: number,
  target_resolution_ms?: number,
  dispatch_ms?: number,
  post_observation_ms?: number,
  verification_ms?: number,
  screenshot_ms?: number,
  serialization_ms?: number
}
```

`debug` returns the full applicable breakdown. `compact` returns `total_ms`; `run_journey` additionally returns each step's `total_ms`. Errors still return elapsed timing.

A checked-in benchmark script must emit JSON and Markdown to `docs/benchmarks/interaction-latency/`; reports contain commit SHA, server version, platform, device model/OS, app build identifier, sample count, warm-up policy, verification/response modes, and p50/p95/min/max for each timing component. Raw data must contain no screenshots, UI text, app package identifiers, or device serials.

## 11. Benchmark protocol and acceptance criteria

The repository owns an Android benchmark fixture at `test/fixtures/latency-journey-app/`. It is self-contained, has no network dependency, and exposes stable accessibility IDs for a repeatable navigation-and-control flow. The benchmark harness builds and installs the fixture.

Before every run, the harness must force-stop the fixture, clear its data, install the known fixture APK, and verify the reset-state `saved-session` selector. The benchmark runs against one named Android emulator image, records its API level and fixture APK SHA-256, and performs no work in parallel. It executes this exact flow:

```text
launch app → open detail → activate control → return Home → reopen detail → change control state → stop
```

The fixture and benchmark harness MUST define and use their own stable selector map, and assert each resulting state. It performs 3 warm-up runs and 10 measured runs per mode.

The baseline invokes the current public tools over a spawned `dist/server.js` stdio MCP connection: `start_app`, `wait_for_ui`, `tap_element` with a handle returned by `wait_for_ui`, and the existing `expect_*` tools. The candidate invokes the new selector `tap_element` and `run_journey`. Both variants include the same waits/assertions and use `full`/`debug` for the compatibility comparison; the candidate additionally runs `light`/`compact`. End-to-end latency is measured by the benchmark client from immediately before its JSON-RPC request write until the corresponding response is fully read, excluding server process startup. The harness separately times explicit `capture_screenshot` and `capture_debug_snapshot` calls outside the journey.

A failed run is reported separately and excluded from percentile calculation; the report must state its failure count, first failed fixture selector, and failed tool/step. The harness emits the exact request sequence and fixture version in the report, with selectors but no UI text or serial number.

Acceptance gates:

- `full` has no regression greater than 10% at p95 for the representative journey and preserves all existing contract tests.
- `light` compact reduces p50 end-to-end MCP journey latency by at least 30% versus full/debug on the same benchmark environment.
- `none` compact has no post-dispatch accessibility read, proven by a focused unit test and its timing breakdown.
- A compact state delta never includes an unchanged node; a requested screenshot is the only path that captures screenshot bytes.
- The benchmark report is checked in for baseline and final runs. If environmental variance prevents the 30% threshold, implementation stops for diagnosis rather than relaxing verification semantics or claiming success.

## 12. Test plan

Add focused unit coverage for:

1. Every verification mode on `tap_element` and `start_app`, including the exact adapter/observation calls and lifecycle/result semantics.
2. Compact/debug compatibility: omitted fields produce the legacy debug envelope; compact retains actionable failure fields and omits verbose metadata.
3. Selector tap success, wait-until-present success, ambiguity, stale/non-actionable rejection, and timeout.
4. `run_journey` ordering, single platform/device resolution, first failed assertion, unexecuted remaining steps, and per-step timing.
5. Delta added/removed/changed identity behavior, revision miss, truncation, and no screenshot when disabled.
6. Action and verification timeout bounds and the absence of a fixed delay once a fresh expected state is observed.
7. Deterministic benchmark report aggregation from fixture timing data.

Existing unit, lint, build, and device checks remain required. Run the real benchmark only after the automated contract gates pass.

## 13. Implementation ownership

- `src/server/tool-definitions.ts`: additive schemas and documentation.
- `src/server/tool-handlers.ts` and `src/server/common.ts`: mode parsing, response shaping, timing envelope, and journey orchestration.
- `src/interact/index.ts`: selector resolve-and-tap, verification policy, deadline propagation, and step execution primitives.
- `src/observe/snapshot-metadata.ts` and `src/observe/index.ts`: changed-node deltas and explicit screenshot collection.
- `src/manage/*`: action-timeout propagation and truthful launch timing.
- `test/unit/{server,interact,observe}/`: contract coverage; `test/device/automated/`: benchmark journey harness.

## 14. Rollout

1. Land timing instrumentation and baseline benchmark without changing defaults.
2. Land verification/response modes with `full`/`debug` defaults and compatibility tests.
3. Land selector tap and state deltas.
4. Land `run_journey` and run before/after device benchmarks.
5. Publish the report and recommend `light`/`compact` for routine agent navigation only after the acceptance gates pass.
