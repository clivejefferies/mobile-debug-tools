# Interact (UI actions)

Tools that perform UI interactions: tap, swipe, type_text, press_back, and waiting for elements.

## tap / swipe / type_text / press_back

Tap input example:

```
{ "platform": "android", "deviceId": "emulator-5554", "x": 100, "y": 200 }
```

Response:

```
{ "device": { "platform": "android", "id": "emulator-5554" }, "success": true }
```

Notes:
- tap: `adb shell input tap x y` (Android) or `idb` events for iOS.
- swipe: `adb shell input swipe x1 y1 x2 y2 duration`.
- type_text: `adb shell input text` (spaces encoded as %s) — may fail for special characters.
- press_back: `adb shell input keyevent 4`.

---

## scroll_to_element

Description:
- Scrolls the UI until an element matching the provided selector becomes visible, or until a maximum number of scroll attempts is reached.
- Delegates platform behaviour to Android and iOS implementations for reliable swipes and UI-tree checks.

Input example:
```
{ "platform": "android", "selector": { "text": "Offscreen Test Element" }, "direction": "down", "maxScrolls": 10, "scrollAmount": 0.7, "deviceId": "emulator-5554" }
```

Response example (found):
```
{ "success": true, "reason": "element_found", "element": { /* element metadata */ }, "scrollsPerformed": 2 }
```

Response example (failure - unchanged UI):
```
{ "success": false, "reason": "ui_unchanged_after_scroll", "scrollsPerformed": 3 }
```

Notes:
- Matching is exact on provided selector fields (text, resourceId, contentDesc, className).
- Visibility check uses element.bounds intersecting the device resolution when available; falls back to the element.visible flag if bounds/resolution are missing.
- The tool fingerprints the visible UI between scrolls; if the fingerprint doesn't change after a swipe the tool stops early assuming end-of-list.
- Android swipe uses `adb shell input swipe` with screen percentage coordinates. iOS swipe uses `idb ui swipe` command; note `idb` swipe does not accept a duration argument.
- Unit tests are located at `test/unit/observe/scroll_to_element.test.ts`, automated device smoke checks under `test/device/automated/...`, and manual device runners under `test/device/manual/...`.

---

## wait_for_screen_change

Description:
- Waits until the current screen fingerprint differs from the provided `previousFingerprint`. Useful after taps, navigation, or other interactions that should change the visible UI.

Input example:
```
{ "platform": "android", "previousFingerprint": "<hex-fingerprint>", "timeoutMs": 5000, "pollIntervalMs": 300, "deviceId": "emulator-5554" }
```

Success response example:
```
{ "success": true, "newFingerprint": "<hex-fingerprint>", "elapsedMs": 420 }
```

Failure (timeout) example:
```
{ "success": false, "reason": "timeout", "lastFingerprint": "<hex-fingerprint>", "elapsedMs": 5000 }
```

Notes:
- Always compares to the original `previousFingerprint` (baseline is not updated during polling).
- Treats `null` fingerprints as transient; continues polling rather than returning success.
- Includes a stability confirmation: after detecting a different fingerprint it waits one additional poll interval and confirms the fingerprint is stable before returning success to avoid reacting to transient flickers or animation frames.
- Default `timeoutMs` is 5000ms and default `pollIntervalMs` is 300ms; callers may override these.
- Implemented as an interact-level tool and delegates platform-specific fingerprint calculation to the observe layer (`get_screen_fingerprint`).

---

## find_element

Purpose:

Locate a UI element on the current screen using semantic matching and return an actionable element descriptor (including tap coordinates) and confidence telemetry.

Input:

```json
{ "query": "string", "exact": false, "timeoutMs": 3000, "platform": "android|ios", "deviceId": "optional device id" }
```

Behaviour:

- Fetches the current UI tree (get_ui_tree) and scores visible elements using: text, content description, resource-id, and class name.
- Normalises strings (lowercase, trimmed). If exact=true require exact match; otherwise allow partial matches (contains) and resource-id/class matches.
- Considers element bounds and visibility; scores non-interactable children as matches and attempts to resolve a clickable ancestor (parent index or containing clickable element) to produce an actionable element.
- Retries until timeoutMs; stops early for high-confidence matches.
- Does not block on long operations and returns partial results where appropriate.

Output:

```json
{
  "found": true,
  "element": {
    "text": "Login",
    "resourceId": "com.example:id/login",
    "contentDesc": null,
    "class": "android.widget.Button",
    "bounds": { "left":0, "top":0, "right":100, "bottom":50 },
    "clickable": true,
    "enabled": true,
    "tapCoordinates": { "x":50, "y":25 },
    "telemetry": { "matchedIndex": 3, "matchedInteractable": true }
  },
  "score": 1.0,
  "confidence": 1.0
}
```

Notes:

- `tapCoordinates` are the recommended center point to use for `tap` calls.
- `confidence` mirrors the internal scoring (0..1) and is suitable for telemetry or logging to decide whether to proceed with an automated action.
- The tool favours actionable (clickable/focusable) targets; when a matching node is not directly actionable, it finds the smallest containing clickable ancestor.
- Unit tests for edge cases (parent-clickable child-text, resource-id matches, fuzzy matching) are under `test/unit/observe/find_element.test.ts`.

---

## wait_for_ui

Purpose:
- Deterministically wait for a UI selector match and return the matched element metadata.

Input (ToolsInteract.waitForUIHandler):
```
{
  "selector": { "text": "optional", "resource_id": "optional", "accessibility_id": "optional", "contains": false },
  "condition": "exists|not_exists|visible|clickable",
  "timeout_ms": 60000,
  "poll_interval_ms": 300,
  "match": { "index": 0 },
  "retry": { "max_attempts": 1, "backoff_ms": 0 },
  "platform": "android|ios",
  "deviceId": "optional device id"
}
```

Success response highlights:
- status: `success`
- matched: number of matches found in the current poll
- element: matched element metadata including `elementId`
- metrics: latency, poll count, attempts

Failure/timeout response:
- status: `timeout`
- error: structured error with `code` and `message`
- metrics: latency, poll count, attempts

Notes & tips:
- `wait_for_ui` is responsible for **resolution only**.
- Successful responses now include an `elementId` that can be passed to `tap_element`.
- This enables the deterministic loop: **observe -> act -> verify**.

Tests:
- Unit: `test/unit/interact/wait_for_ui_contract.test.ts` and `test/unit/interact/wait_for_ui_selector_matching.test.ts`
- Automated device checks now live under `test/device/automated/...`; manual/debug runners live under `test/device/manual/...` (requires devices/emulators and adb/xcrun in PATH)

Example:
```
ToolsInteract.waitForUIHandler({
  selector: { text: 'Generate Session' },
  condition: 'clickable',
  timeout_ms: 5000,
  platform: 'android'
})
```

Troubleshooting:
- If `wait_for_ui` times out, confirm the selector is precise and that the current UI tree exposes the expected text, resource ID, or accessibility ID.

## tap_element

Purpose:
- Execute a tap against a UI element that has already been resolved by `wait_for_ui`.

Input:
```
{ "elementId": "el_..." }
```

Behavior:
- validates that the element still exists in the current UI context
- validates that the element is visible
- validates that the element is enabled
- performs the tap using the resolved element bounds

Success response:
```
{ "success": true, "elementId": "el_123", "action": "tap" }
```

Failure response:
```
{
  "success": false,
  "elementId": "el_123",
  "action": "tap",
  "error": { "code": "element_not_found|element_not_visible|element_not_enabled", "message": "..." }
}
```

Notes:
- `tap_element` does **not** accept selectors.
- `tap_element` does **not** perform lookup, waiting, retries, or ambiguity resolution.
- Migration pattern for selector-based flows is:
  1. `wait_for_ui(selector)`
  2. `tap_element(elementId)`
