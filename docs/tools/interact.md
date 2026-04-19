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
- Wait for a condition to occur on the device: UI element appearance, a log line, a screen fingerprint change, or an idle/stable screen state.

Supported types and behavior:
- ui: Delegates to `find_element` to perform a semantic search of the UI tree. Returns the matched element descriptor (including tapCoordinates) when found.
- log: Reads the active log stream (via `start_log_stream`/`readLogStreamHandler`) and falls back to a snapshot of recent logs (`getLogsHandler`). Matches when the query substring appears in a new log line after a captured baseline.
- screen: Compares screen fingerprints (visual checks) against an initial baseline and returns when fingerprint changes. If `query` is provided it will attempt a `find_element` on the new screen to validate the expected content.
- idle: Waits until the screen fingerprint remains stable for a short stability window (default 1000ms).

Input (ToolsInteract.waitForUIHandler):
```
{ "type": "ui|log|screen|idle", "query": "optional string", "timeoutMs": 5000, "pollIntervalMs": 200, "platform": "android|ios", "deviceId": "optional device id" }
```

Success response highlights:
- success: true
- type: requested type
- matched: true
- details: human-friendly explanation
- timestamp: epoch ms
- element: (for ui/screen when matched) actionable element metadata with tapCoordinates
- log: (for log) matched log message and raw entry
- newFingerprint: (for screen) new fingerprint value

Failure/timeout response:
- success: false
- error or reason: explanation
- type: requested type
- timeoutMs: value used

Notes & tips:
- Defaults (timeoutMs=5000, pollIntervalMs=200) balance responsiveness with device query overhead; adjust in tests or scripts as needed.
- For UI-sensitive flows prefer type='ui' rather than relying solely on visual fingerprint changes, as some UI updates don't alter the fingerprint.

Tests:
- Unit: `test/unit/interact/wait_for_ui_contract.test.ts` and `test/unit/interact/wait_for_ui_selector_matching.test.ts`
- Automated device checks now live under `test/device/automated/...`; manual/debug runners live under `test/device/manual/...` (requires devices/emulators and adb/xcrun in PATH)

Example:
```
// Wait up to 5s for a button labeled "Generate Session" on Android
ToolsInteract.waitForUIHandler({ type: 'ui', query: 'Generate Session', timeoutMs: 5000, platform: 'android' })
```

Troubleshooting:
- If wait_for_ui(log) never matches, ensure log streaming is started for the target package and baseline logs captured correctly.
- If wait_for_ui(screen) times out despite visible UI change, try type='ui' to validate content-level changes.
