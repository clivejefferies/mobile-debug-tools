# Interact (UI actions, waits, and verification)

This document covers deterministic UI resolution, actions, waits, and outcome verification.

## Verification pattern

For mutation actions, the intended agent loop is:

**RESOLVE -> ACT -> WAIT (if needed) -> EXPECT**

Role split:

- `wait_for_*` = resolution and synchronization
- `expect_*` = final outcome verification

Important:

- `wait_for_*` tools must not be used as the final verification of action success when an applicable `expect_*` tool exists.
- action tools report execution success, not outcome correctness.
- `classify_action_outcome` should receive the runtime `action_type` when you want routing to distinguish local-state and side-effect actions.

## Conditional actions

`tap`, `tap_element`, and `swipe` (Android/iOS), plus Android `type_text` and
`press_back`, accept an optional expected UI snapshot. Journey `tap` steps accept
it per step. Other tools and step types reject `expectedState` rather than ignore
it; it is not supported in journey defaults or on the journey itself.

First call `get_ui_tree` on the chosen device. From a successful response, use
`snapshot_session_id` and `snapshot_revision`:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "selector": { "accessibility_id": "save" },
  "expectedState": {
    "snapshotSessionId": "<snapshot_session_id from get_ui_tree>",
    "snapshotRevision": 12,
    "timeoutMs": 15000
  },
  "verificationMode": "none",
  "responseMode": "compact"
}
```

This is a `tap_element` example. Guarded standalone calls require explicit
`platform` and concrete `deviceId` from the observed tree; `booted` and `default`
are not valid guarded targets. Journey taps inherit the journey's resolved device.
The expected-state object is strict: nonempty session ID, positive safe-integer
revision, and optional integer timeout of 100–60000 ms (default 15000). Invalid or
unsupported conditions return an `INVALID_ARGUMENT` error before device work.
Calls without a condition preserve existing behaviour.

After target and adapter preparation, the server reads a new hierarchy just
before native input. It checks the same device, server session, and retained
revision, even with post-action verification disabled. It never waits for a
mismatch to become a match or retries/rebases the input automatically.

| Result | Meaning |
| --- | --- |
| `condition.status: matched` | Condition passed; inspect the ordinary action outcome for delivery and verify its effect separately. |
| `PRECONDITION_FAILED`, `condition.status: mismatch` | State changed; input was not dispatched. The condition includes the exact fresh tree that blocked it. |
| `PRECONDITION_UNAVAILABLE`, `condition.status: unavailable` | Condition could not be established; input was not dispatched. Inspect `condition.reason` and observe again. |
| `condition.status: not_checked` | Target/capability preparation failed before reaching the guard; inspect the original action failure. |

Blocked input reports `success: false`, `dispatch_started: false`,
`delivery_status: not_delivered`, `retryable: false`, `lifecycle_state: failed`,
and `verification.status: not_requested`. No network action window is reset and
no post-input verification runs. A failed conditional journey tap stops the
journey; subsequent steps are `not_run` and earlier steps are not rolled back.

Condition evidence has `status`, `expected: { snapshot_session_id,
snapshot_revision }`, `observed`, `elapsed_ms`, and an optional `reason`.
Reasons are `BASELINE_UNAVAILABLE`, `SESSION_MISMATCH`, `DEVICE_MISMATCH`,
`OBSERVATION_FAILED`, `OBSERVATION_INVALID`, `CONDITION_TIMEOUT`, or
`ACTION_NOT_REACHED` for a check that was not reached. `observed` is null when
there is no valid fresh observation. Error trees cannot authorise input merely
because they contain an old revision.

Debug responses retain the full condition tree. Compact responses retain full
fresh evidence on mismatch/unavailable results; this is an exception to their
usual omission of device identifiers and tree contents. Successful compact
conditions contain only observed session/revision and capture time. UI trees may
contain private text; avoid copying them into logs unnecessarily.

The baseline must still be in this process's same-device history: up to eight
revisions, retained for ten minutes since a successful observation of that
revision. Server restart or eviction requires a new observation. A fresh read
cannot evict the baseline out from under its own check.

The match covers the existing normalized accessibility snapshot: element text,
identity, state, bounds, actionability, screen, and resolution. String identity
fields are trimmed/lowercased; native state values retain their representation.
All elements contribute, even when delta history is truncated. Pixel-only,
backend, inaccessible, and normalization-hidden changes are not detected; the
current tree does not establish foreground package/activity. Any observed
intervening change invalidates the old revision, even if the UI later returns.

A condition read can add seconds. Its timeout budget is separate from the action
budget; enclosing operation deadlines still apply. This check is not atomic with
OS input delivery. Concurrent clients, external input, or app updates can change
the UI after the observation. Sequence device actions and verify outcomes with
`expect_*` as usual.

## tap / swipe / type_text / press_back

These tools return a shared action execution envelope.

Example `tap` input:

```json
{ "platform": "android", "deviceId": "emulator-5554", "x": 100, "y": 200 }
```

Example response:

```json
{
  "action_id": "tap_1710000000000_1",
  "timestamp": "2026-04-23T08:00:00.000Z",
  "action_type": "tap",
  "lifecycle_state": "pending_verification",
  "source_module": "server",
  "target": { "selector": { "x": 100, "y": 200 }, "resolved": null },
  "success": true,
  "trace": {
    "action_id": "tap_element_1710000000002_3",
    "steps": [
      {
        "stage": "resolve",
        "timestamp": 1710000000002,
        "result": "success",
        "attempt_index": 0
      },
      {
        "stage": "execute",
        "timestamp": 1710000000003,
        "result": "success",
        "attempt_index": 1
      }
    ],
    "final_outcome": "success",
    "attempts": 1
  },
  "ui_fingerprint_before": "fp_before",
  "ui_fingerprint_after": "fp_after"
}
```

Guidance:

- `tap` is best for coordinate-based interactions when no resolved element is available.
- `swipe` is execution-only; use `wait_for_*` and `expect_*` to verify its effect when the expected outcome is known.
- `type_text` reports whether text entry was dispatched, not whether the intended field state is correct.
- `press_back` reports whether the back action was dispatched, not whether the intended destination screen was reached.

Preferred verification:

- navigation outcome known -> `expect_screen`
- local UI change known -> `expect_element_visible`
- readable element state known -> `expect_state`
- backend/API activity expected -> `classify_action_outcome` + optional `get_network_activity` if the UI signal remains ambiguous

Use `wait_for_screen_change` only when a visible transition is the expected outcome. If a button should trigger an API request but the screen should stay the same, rely on `action_type` plus classification first.
For backend-only actions, prefer comparing `get_screen_fingerprint` before/after and collect `get_network_activity` immediately after the action only if the result is still ambiguous; do not wait on `wait_for_screen_change` if no visible transition is expected.
Use `wait_for_ui_change` when the screen stays in place but visible text or element state should change.

---

## scroll_to_element

Scroll until an element matching the provided selector becomes visible, or until the tool reaches a stopping condition.

Input example:

```json
{ "platform": "android", "selector": { "text": "Offscreen Test Element" }, "direction": "down", "maxScrolls": 10, "scrollAmount": 0.7, "deviceId": "emulator-5554" }
```

Response example (found):

```json
{ "success": true, "reason": "element_found", "element": { "text": "Offscreen Test Element" }, "scrollsPerformed": 2 }
```

Response example (failure - unchanged UI):

```json
{ "success": false, "reason": "ui_unchanged_after_scroll", "scrollsPerformed": 3 }
```

Notes:

- Matching is exact on provided selector fields (`text`, `resourceId`, `contentDesc`, `className`).
- The tool fingerprints the visible UI between scrolls and can stop early if the UI does not change after a swipe.
- `scroll_to_element` can return success when it finds the element, but use `expect_element_visible` when you want explicit final verification of the expected visible result.

---

## wait_for_screen_change

Purpose:

- detect that a screen transition has occurred by waiting for the current fingerprint to differ from a previous fingerprint

Capabilities:

- synchronization when transition timing is uncertain
- detection that something changed on screen

Constraints:

- does not verify correctness of the resulting state
- must not be used alone to confirm action success when an applicable `expect_*` tool exists

Input example:

```json
{ "platform": "android", "previousFingerprint": "<hex-fingerprint>", "timeoutMs": 5000, "pollIntervalMs": 300, "deviceId": "emulator-5554" }
```

Success response example:

```json
{
  "success": true,
  "previousFingerprint": "<old-hex-fingerprint>",
  "newFingerprint": "<hex-fingerprint>",
  "elapsedMs": 420,
  "observed_screen": { "fingerprint": "<hex-fingerprint>", "activity": "MainActivity" }
}
```

Failure (timeout) example:

```json
{
  "success": false,
  "reason": "timeout",
  "previousFingerprint": "<old-hex-fingerprint>",
  "lastFingerprint": "<hex-fingerprint>",
  "elapsedMs": 5000,
  "observed_screen": { "fingerprint": "<hex-fingerprint>", "activity": "HomeActivity" }
}
```

Notes:

- Always compares to the original `previousFingerprint`.
- Treats `null` fingerprints as transient and keeps polling.
- Adds a stability confirmation before returning success to avoid transient animation frames.
- Follow with `expect_screen` when the expected destination is known.
- Do not use this as the main success check for backend/API activity that does not change the visible UI.

---

## wait_for_ui_change

Purpose:

- detect a stable in-place UI mutation without naming a target element first

Capabilities:

- waits for hierarchy, text, or state deltas
- uses snapshot revision metadata when available
- confirms the change remains stable before returning success
- defaults `stability_window_ms` to `300`

Mutation rules:

- synchronization-relevant: element addition or removal, visibility changes, enabled-state changes, navigation transitions, text or content-description changes, subtree structure mutation, semantic accessibility tree mutation
- not synchronization-relevant: animation frame updates, layout-only jitter, opacity-only visual transitions, non-semantic rendering updates

Guidance:

- prefer `wait_for_screen_change` for navigation
- prefer `wait_for_ui_change` for in-place updates and recomposition-style changes
- follow with `expect_*` when the expected final state is known

---

## adjust_control

Purpose:

- adjust a numeric control value with bounded verification

Notes:

- initial support is for slider-like controls that expose `value_range` or readable numeric value state
- `expect_state` is the verification surface used to read back the resulting value
- direct target placement is preferred; drag fallback is treated as degraded mode
- the tool returns `target_state`, `actual_state`, `within_tolerance`, `converged`, `attempts`, and `adjustment_mode`

Input example:

```json
{ "selector": { "text": "Duration" }, "property": "value", "targetValue": 30, "tolerance": 0.5, "platform": "android", "deviceId": "emulator-5554" }
```

---

## find_element

Locate a UI element on the current screen using semantic matching and return an actionable element descriptor.

Input:

```json
{ "query": "Login", "exact": false, "timeoutMs": 3000, "platform": "android", "deviceId": "emulator-5554" }
```

Output:

```json
{
  "found": true,
  "element": {
    "text": "Login",
    "resourceId": "com.example:id/login",
    "contentDesc": null,
    "class": "android.widget.Button",
    "bounds": { "left": 0, "top": 0, "right": 100, "bottom": 50 },
    "clickable": true,
    "enabled": true,
    "tapCoordinates": { "x": 50, "y": 25 },
    "telemetry": { "matchedIndex": 3, "matchedInteractable": true }
  },
  "score": 1.0,
  "confidence": 1.0,
  "resolution": {
    "confidence": 1.0,
    "reason": "exact_text_match",
    "fallback_available": false,
    "matched_count": 1,
    "alternates": []
  }
}
```

Notes:

- Best used when no precise selector is available yet.
- `tapCoordinates` are suitable for `tap` calls.
- `resolution` explains why the element was selected and may include fallback alternates when the runtime had to promote a parent or nearby control.
- Prefer `wait_for_ui` when you already know a deterministic selector and want a stable `elementId`.

---

## wait_for_ui

Purpose:

- resolve elements and/or detect that a UI availability condition has occurred

Capabilities:

- deterministic element resolution
- synchronization when element timing or availability is uncertain

Constraints:

- does not verify correctness of the resulting state
- must not be used alone to confirm action success when an applicable `expect_*` tool exists

Input:

```json
{
  "selector": { "text": "Generate Session", "contains": false },
  "condition": "clickable",
  "timeout_ms": 5000,
  "poll_interval_ms": 300,
  "match": { "index": 0 },
  "retry": { "max_attempts": 1, "backoff_ms": 0 },
  "platform": "android",
  "deviceId": "emulator-5554"
}
```

Success response:

```json
{
  "status": "success",
  "matched": 1,
  "element": {
    "text": "Generate Session",
    "resource_id": null,
    "accessibility_id": null,
    "class": "android.widget.TextView",
    "bounds": [471, 1098, 809, 1158],
    "index": 8,
    "elementId": "el_..."
  },
  "metrics": { "latency_ms": 120, "poll_count": 1, "attempts": 1 },
  "requested": {
    "selector": { "text": "Generate Session", "contains": false },
    "condition": "clickable",
    "match": { "index": 0 }
  },
  "observed": {
    "matched_count": 1,
    "condition_satisfied": true,
    "selected_index": 8,
    "last_matched_element": {
      "text": "Generate Session",
      "resource_id": null,
      "accessibility_id": null,
      "class": "android.widget.TextView",
      "bounds": [471, 1098, 809, 1158],
      "index": 8,
      "elementId": "el_..."
    }
  }
}
```

Timeout response:

```json
{
  "status": "timeout",
  "error": { "code": "ELEMENT_NOT_FOUND", "message": "Condition visible not satisfied within timeout; observed 1 match(es)" },
  "metrics": { "latency_ms": 5000, "poll_count": 17, "attempts": 1 },
  "requested": {
    "selector": { "text": "Generate Session", "contains": false },
    "condition": "visible",
    "match": { "index": 0 }
  },
  "observed": {
    "matched_count": 1,
    "condition_satisfied": false,
    "selected_index": 8,
    "last_matched_element": {
      "text": "Generate Session",
      "resource_id": null,
      "accessibility_id": null,
      "class": "android.widget.TextView",
      "bounds": [471, 1098, 809, 1158],
      "index": 8,
      "elementId": "el_..."
    }
  }
}
```

Notes:

- Use `wait_for_ui` to get a stable `elementId` for `tap_element`.
- Use it before an action when the target element or timing is uncertain.
- Use `requested` and `observed` to see exactly what condition was checked and what the last poll actually found.
- If the expected outcome is known after the action, follow with `expect_*`.

---

## tap_element

Tap a previously resolved UI element using its `elementId`.

Input:

```json
{ "elementId": "el_..." }
```

Success response:

```json
{
  "action_id": "tap_element_1710000000000_1",
  "timestamp": "2026-04-23T08:00:00.000Z",
  "action_type": "tap_element",
  "lifecycle_state": "pending_verification",
  "source_module": "interact",
  "target": {
    "selector": { "elementId": "el_123" },
    "resolved": {
      "elementId": "el_123",
      "text": "Play session",
      "resource_id": null,
      "accessibility_id": null,
      "class": "android.widget.TextView",
      "bounds": [519, 1770, 762, 1830],
      "index": 11
    }
  },
  "success": true,
  "ui_fingerprint_before": "fp_before",
  "ui_fingerprint_after": "fp_after"
}
```

Failure response:

```json
{
  "action_id": "tap_element_1710000000001_2",
  "timestamp": "2026-04-23T08:00:00.001Z",
  "action_type": "tap_element",
  "target": { "selector": { "elementId": "el_123" }, "resolved": null },
  "success": false,
  "failure_code": "STALE_REFERENCE",
  "retryable": true,
  "trace": {
    "action_id": "tap_element_1710000000003_4",
    "steps": [
      {
        "stage": "resolve",
        "timestamp": 1710000000003,
        "result": "failure",
        "attempt_index": 0
      },
      {
        "stage": "execute",
        "timestamp": 1710000000004,
        "result": "failure",
        "attempt_index": 1
      },
      {
        "stage": "recover",
        "timestamp": 1710000000005,
        "result": "retry",
        "attempt_index": 2
      }
    ],
    "final_outcome": "failure",
    "attempts": 1
  },
  "recovery": {
    "failure_class": "TargetResolutionFailure",
    "runtime_code": "STALE_REFERENCE",
    "recovery_attempts": 0,
    "max_recovery_attempts": 3,
    "retry_depth": 0,
    "max_retry_depth": 3,
    "is_terminal": false,
    "retry_allowed": true
  },
  "ui_fingerprint_before": "fp_before",
  "ui_fingerprint_after": "fp_before"
}
```

Recommended usage:

1. resolve target with `wait_for_ui`
2. call `tap_element`
3. if needed, wait for transition with `wait_for_*`
4. verify with `expect_*`

Verification guidance:

- navigation -> `expect_screen`
- local UI change -> `expect_element_visible`

Failure handling:

- `STALE_REFERENCE` -> re-resolve the element, then retry
- `ELEMENT_NOT_INTERACTABLE` -> wait or refine the target, then retry
- `UNKNOWN` -> capture a snapshot and stop

---

## expect_screen

Deterministically verify that the intended navigation outcome of an action has occurred.

Input:

```json
{ "platform": "android", "deviceId": "emulator-5554", "fingerprint": "<expected-fingerprint>" }
```

or

```json
{ "platform": "android", "deviceId": "emulator-5554", "screen": "com.example.app.MainActivity" }
```

Response:

```json
{
  "success": true,
  "observed_screen": { "fingerprint": "<actual-fingerprint>", "screen": "com.example.app.MainActivity" },
  "expected_screen": { "fingerprint": "<expected-fingerprint>", "screen": null },
  "confidence": 1,
  "comparison": {
    "basis": "fingerprint",
    "matched": true,
    "reason": "observed fingerprint matches expected fingerprint <expected-fingerprint>"
  }
}
```

Notes:

- Primary and authoritative verification tool for navigation outcomes.
- Prefer fingerprints; use semantic screen identifiers as a fallback.
- Works best when the expected screen identifier is known ahead of time.
- If transition timing is uncertain, place `wait_for_screen_change` before `expect_screen`.

---

## expect_element_visible

Deterministically verify that the intended UI outcome of an action has occurred by confirming a target element is visible.

Input:

```json
{
  "selector": { "text": "Play session" },
  "element_id": "optional-resolved-element-id",
  "timeout_ms": 5000,
  "poll_interval_ms": 300,
  "platform": "android",
  "deviceId": "emulator-5554"
}
```

Response:

```json
{
  "success": true,
  "selector": { "text": "Play session" },
  "element_id": "el_123",
  "expected_condition": "visible",
  "element": {
    "elementId": "el_123",
    "text": "Play session",
    "resource_id": null,
    "accessibility_id": null,
    "class": "android.widget.TextView",
    "bounds": [519, 1770, 762, 1830],
    "index": 11
  },
  "observed": {
    "status": "success",
    "matched_count": 1,
    "condition_satisfied": true,
    "selected_index": 11
  },
  "reason": "selector is visible"
}
```

Notes:

- Primary and authoritative verification tool for expected element visibility.
- `selector` is the primary input; `element_id` is optional context only.
- The tool resolves the selector internally when needed.
- On failure, `reason` and `observed` tell you whether the selector was missing entirely or present but not yet visible.
- Use when the screen should remain on the same destination but a specific element should appear or become visible.

---

## expect_state

Deterministically verify a readable state property on a visible element.

Input:

```json
{
  "selector": { "text": "Notifications" },
  "property": "checked",
  "expected": true,
  "platform": "android",
  "deviceId": "emulator-5554"
}
```

Notes:

- Use this when the element is visible but its state also matters.
- Supported properties include `checked`, `selected`, `focused`, `expanded`, `enabled`, `text_value`, `value`, and `raw_value`.
- The tool compares normalized state and returns the observed value when available.

---

## classify_action_outcome + get_network_activity

Use this pair when the action may trigger network/backend work and the screen may not visibly change.

Pattern:

1. perform the action
2. call `classify_action_outcome` with `uiChanged` from `wait_for_screen_change` or a screen fingerprint comparison
3. pass the runtime `action_type` value as `actionType`
4. collect `get_network_activity` only if the action is side-effect oriented and the UI signal remains ambiguous
5. call `classify_action_outcome` again with `networkRequests` if you collected them

Guidance:

- `uiChanged=true` or `expectedElementVisible=true` means the action outcome is already verified
- local-state actions should prefer refreshed snapshots, `expect_state`, or `expect_element_visible` over default network inspection
- network activity is auxiliary evidence, not mandatory proof

## Interaction execution controls (RFC 018)

`start_app`, `restart_app`, `tap`, `tap_element`, `swipe`, `scroll_to_element`,
`type_text`, and `press_back` accept `verificationMode` (`none`, `light`, `full`)
and `responseMode` (`compact`, `debug`). Omitted controls retain `full`/`debug`.
`none` reports dispatch without post-action accessibility reads. `light` requests
one fresh tree; an unavailable observation does not turn successful delivery into
a failed action. Use an explicit assertion to establish the intended outcome.
Compact responses retain delivery, retry, lifecycle, and timing fields.

`actionTimeoutMs` and `verificationTimeoutMs` are integer budgets, clamped to
100–30,000 and 100–60,000 ms respectively. An action timeout after dispatch starts
has unknown delivery and must be observed before retrying.

`tap_element` accepts exactly one `elementId` or `selector`. A selector supports
`text`, `resource_id`, `accessibility_id`, and `contains`. Optional `waitFor` waits
for the target before tapping; without it, resolution uses one observation with
the action budget (default 5,000 ms), rather than a separate shorter cutoff.
An explicit `waitFor.timeoutMs` remains bounded by the overall action budget.
Selector taps resolve matching label text to its actionable ancestor using the
existing clickable-wait policy, including `waitFor.condition: exists` or `visible`.
Hidden/disabled labels and non-actionable containers cannot be bypassed.
Observation timeouts report `ACTION_TIMEOUT`, rather than claiming a missing target.
Ambiguous targets require an explicit `waitFor.match.index`.

`run_journey` accepts 1–50 steps with unique IDs, on one platform/device. Supported
step types are `start_app`, `tap`, `wait`, and `assert`. Assertions support
`element_visible`, `element_absent`, `screen_fingerprint`, and `state_equals`.
The complete request is validated before device work. The first failed step stops
the journey; remaining steps report `not_run`. Journey responses default to compact.
`defaults` supplies execution controls; step verification overrides the default.
`captureOnFailure: true` includes a screenshot-free failure snapshot in debug mode.

See [RFC 018](../specs/018-interaction-latency-and-batched-journeys/spec.md) for
contracts and the device acceptance criteria.

## Readiness-aware waits

`wait_for_ui` and `wait_for_ui_change` accept optional `requireReady: true`.
They require both their existing predicate and settled full-screen UI readiness
on the same current samples. Readiness uses a 500 ms stability window, shares the
wait's existing deadline (including retries), and adds no separate hierarchy reads.

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "selector": { "text": "Ready" },
  "condition": "visible",
  "requireReady": true,
  "timeout_ms": 30000
}
```

Results retain the existing success/timeout envelope and include `readiness`
evidence and limitations. Opt-in shared-deadline expiry uses a `TIMEOUT` error
code and preserves whether the underlying predicate was observed; a readiness
timeout does not mean that a visible target was absent. A visible target while a loader is active cannot pass
this opt-in check. Observation failure resets readiness continuity; an exhausted
budget is not proof of an unresponsive app. Default `requireReady: false` retains
existing predicate semantics. There is no new journey assertion or change to
conditional-action preconditions. See [app readiness](observe.md#app-readiness)
for supported states and limits.

## Correlated evidence

Actions and journeys expose identifiers and phase timestamps for linking later
observations. See [correlated evidence](evidence.md) for scope and limitations.
