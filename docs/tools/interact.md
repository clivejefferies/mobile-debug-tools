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
  "timestamp": 1710000000000,
  "action_type": "tap",
  "target": { "selector": { "x": 100, "y": 200 }, "resolved": null },
  "success": true,
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
{ "success": true, "newFingerprint": "<hex-fingerprint>", "elapsedMs": 420 }
```

Failure (timeout) example:

```json
{ "success": false, "reason": "timeout", "lastFingerprint": "<hex-fingerprint>", "elapsedMs": 5000 }
```

Notes:

- Always compares to the original `previousFingerprint`.
- Treats `null` fingerprints as transient and keeps polling.
- Adds a stability confirmation before returning success to avoid transient animation frames.
- Follow with `expect_screen` when the expected destination is known.

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
  "confidence": 1.0
}
```

Notes:

- Best used when no precise selector is available yet.
- `tapCoordinates` are suitable for `tap` calls.
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
  "metrics": { "latency_ms": 120, "poll_count": 1, "attempts": 1 }
}
```

Timeout response:

```json
{
  "status": "timeout",
  "error": { "code": "ELEMENT_NOT_FOUND", "message": "Condition visible not satisfied within timeout" },
  "metrics": { "latency_ms": 5000, "poll_count": 17, "attempts": 1 }
}
```

Notes:

- Use `wait_for_ui` to get a stable `elementId` for `tap_element`.
- Use it before an action when the target element or timing is uncertain.
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
  "timestamp": 1710000000000,
  "action_type": "tap_element",
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
  "timestamp": 1710000000001,
  "action_type": "tap_element",
  "target": { "selector": { "elementId": "el_123" }, "resolved": null },
  "success": false,
  "failure_code": "STALE_REFERENCE",
  "retryable": true,
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
  "confidence": 1
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
  "element": {
    "elementId": "el_123",
    "text": "Play session",
    "resource_id": null,
    "accessibility_id": null,
    "class": "android.widget.TextView",
    "bounds": [519, 1770, 762, 1830],
    "index": 11
  }
}
```

Notes:

- Primary and authoritative verification tool for expected element visibility.
- `selector` is the primary input; `element_id` is optional context only.
- The tool resolves the selector internally when needed.
- Use when the screen should remain on the same destination but a specific element should appear or become visible.
