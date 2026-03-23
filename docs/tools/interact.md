# Interact (UI actions)

Tools that perform UI interactions: tap, swipe, type_text, press_back, and waiting for elements.

## wait_for_element
Wait until a UI element with matching text appears on screen or timeout is reached.

Input:

```
{ "platform": "android", "text": "Home", "timeout": 5000, "deviceId": "emulator-5554" }
```

Response:

```
{ "device": { "platform": "android", "id": "emulator-5554" }, "found": true, "element": { "text": "Home", "resourceId": "com.example:id/home" } }
```

Notes:
- Polls get_ui_tree until timeout or element found. Returns an `error` field if system failures occur.

---

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
- Unit tests are located at `test/unit/observe/scroll_to_element.test.ts` and device runners at `test/device/observe/`.

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

