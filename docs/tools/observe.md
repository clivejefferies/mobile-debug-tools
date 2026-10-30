# Observe (logs, screenshots, UI trees)

Tools that retrieve device state, logs, screenshots, fingerprints, and UI hierarchies.

These tools are primarily for:

- building context before an action
- supporting synchronization
- diagnostics when verification fails

They are **not** the primary success signal when an applicable `expect_*` tool exists.

Covered observations support optional `actionRef` and return acquisition/freshness
metadata; see [correlated evidence](evidence.md).

## get_logs

Fetch recent logs as structured entries optimized for AI agents.

Use logs as a debugging aid only. Prefer `expect_*` for verification, and use logs after verification fails or when an error is suspected.

Input (example):

```json
{ "platform": "android|ios", "appId": "com.example.app", "deviceId": "emulator-5554", "pid": 1234, "tag": "MyTag", "level": "ERROR", "contains": "timeout", "since_seconds": 60, "limit": 50 }
```

Defaults:

- No filters → return the most recent 50 log entries (app-scoped if appId provided), across all levels.

When to use get_logs:

- After deterministic verification fails.
- When you suspect a crash, error, or silent failure that the UI doesn't expose.
- To provide additional debugging context correlated with an action.

Do NOT use get_logs as the primary signal for success/failure, or call it repeatedly without new actions.

Response (structured):

```json
{ "device": { "platform": "android", "id": "emulator-5554" }, "logs": [ { "timestamp": "2026-03-30T16:00:00.000Z", "level": "ERROR", "tag": "MyTag", "pid": 1234, "message": "Something failed" } ], "logCount": 1, "source": "pid|package|process|broad", "meta": { "filters": { "tag": "MyTag", "level": "ERROR" }, "pidArg": 1234 } }
```

Notes:

- Each log entry: timestamp (ISO), level (VERBOSE|DEBUG|INFO|WARN|ERROR), tag (string), pid (number|null), message (string).
- Logs ordered oldest → newest. logCount equals number of entries returned.
- `source`: indicates how logs were filtered at collection time. Values: `pid` (filtered by process id), `package` / `process` (filtered by app/package/bundle), or `broad` (unfiltered system logs).
- `meta`: debugging information about filters and collection method (e.g., pid detection, effective limit).
- Supported filters: pid, tag, level, contains, since_seconds, limit.
- Platform behaviour: Android uses `adb logcat` with source-side filters where possible; iOS uses unified logging (`log show`/simctl) and maps subsystem/category → tag.
- Errors are returned as structured objects with `error.code` and `error.message`. Possible codes: LOGS_UNAVAILABLE, INVALID_FILTER, PLATFORM_NOT_SUPPORTED, INTERNAL_ERROR.

## capture_screenshot
Capture the current screen. Returns JSON metadata followed by one or more image blocks.

Input:

```
{ "platform": "android", "deviceId": "emulator-5554" }
```

Response (metadata):

```json
{ "device": { "platform": "android", "id": "emulator-5554" }, "result": { "resolution": { "width": 1080, "height": 2400 }, "mimeType": "image/webp" } }
```

Notes:
- The image block may use WebP, PNG, or a compatibility fallback such as JPEG.
- Best used for inspection and debugging, not as a primary verification mechanism.

---

## get_ui_tree
Return the parsed UI hierarchy for the current screen.

Input:

```
{ "platform": "android", "deviceId": "emulator-5554" }
```

Response (example):

```json
{ "device": { "platform": "android", "id": "emulator-5554" }, "screen": "", "resolution": { "width": 1080, "height": 2400 }, "snapshot_revision": 12, "captured_at_ms": 1710000000123, "loading_state": { "active": true, "signal": "spinner", "source": "ui_tree" }, "elements": [ { "text": "Sign in", "type": "android.widget.Button", "resourceId": "com.example:id/signin", "clickable": true, "bounds": [0,0,100,50], "state": { "enabled": true }, "stable_id": "com.example:id/signin", "role": "button", "test_tag": "com.example:id/signin", "selector": { "value": "com.example:id/signin", "confidence": { "score": 1, "reason": "resource_id" } }, "semantic": { "is_clickable": true, "is_container": false } } ] }
```

Notes:
- Useful for inspection, selector development, and fallback debugging.
- Elements may include a normalized `state` object when the platform exposes readable state such as checked, selected, focused, expanded, text input, or slider values.
- Elements may also include platform-native identity hints such as `stable_id`, `role`, `test_tag`, `selector`, and `semantic`.
- The tree response may include `snapshot_revision`, `captured_at_ms`, and `loading_state` when a reliable signal is available.
- Successful tree observations include `snapshot_session_id`, a random identifier
  for this server process. Use it with `snapshot_revision` for
  [conditional actions](interact.md#conditional-actions) on the same device.
  Compact tree responses preserve the session ID and revision. Never derive an
  expectation from an error tree, even when it carries an older revision.
- Prefer `wait_for_ui` for deterministic element resolution in interactive flows.
- Android reads the accessibility hierarchy with `uiautomator dump` through ADB. No helper APK is installed or required.

---

## get_current_screen
Get visible Android activity.

Input:

```
{ "deviceId": "emulator-5554" }
```

Response:

```json
{ "device": { "platform": "android", "id": "emulator-5554" }, "package": "com.example.app", "activity": "com.example.app.MainActivity", "shortActivity": "MainActivity" }
```

---

## capture_debug_snapshot
Capture a complete debug snapshot of the app state for diagnostics and post-mortem analysis.

Input:

```json
{
  "reason": "optional string describing why snapshot is taken",
  "includeLogs": true,
  "logLines": 200,
  "platform": "android | ios",
  "appId": "optional package/bundle id to scope logs",
  "deviceId": "optional device serial/udid",
  "sessionId": "optional log stream session id to prefer"
}
```

Behavior:
- Captures screenshot (base64), current activity (Android), screen fingerprint, full UI tree, and recent logs.
- Prefers active log stream entries (read_log_stream) and falls back to get_logs when no active stream is available.
- Returns partial data when components fail and includes per-part error fields (e.g. `screenshot_error`, `ui_tree_error`).
- Caps logs to `logLines` entries and prefers recent entries.
- Fast by default: does not wait for new logs and avoids long blocking operations.
- Returns a dual-layer payload:
  - `raw` is authoritative and contains the underlying observation data unchanged.
- `semantic` is optional, derived from `raw`, and intended for planning only.
- `raw` now includes `snapshot_revision`, `captured_at_ms`, and `loading_state` when detectable.

Response (example):

```json
{
  "raw": {
    "timestamp": 1710000000,
    "reason": "Crash after tapping checkout",
    "activity": "CheckoutActivity",
    "fingerprint": "abc123",
    "screenshot": "<base64 PNG string>",
    "ui_tree": { ... },
    "logs": [ { "timestamp": "2024-03-09T12:00:00.000Z", "level": "ERROR", "tag": "CheckoutViewModel", "pid": 1234, "message": "NullPointerException at CheckoutViewModel" } ]
  },
  "semantic": {
    "screen": "Checkout",
    "signals": {
      "has_error_logs": true,
      "has_clickable_elements": false
    },
    "actions_available": ["review checkout", "inspect error"],
    "confidence": 0.82,
    "warnings": []
  }
}
```

Notes:
- Useful immediately after detecting crashes or unexpected UI behaviour.
- Do not expect perfect data during a crash; tool is designed to return best-effort context and include errors for failed parts.
- Treat `semantic` as planning guidance only; `raw` remains the source of truth.

---

## get_screen_fingerprint
Generate a stable fingerprint representing the visible screen. Useful for detecting navigation changes, preventing loops, and synchronization.

Input (optional):

```
{ "platform": "android", "deviceId": "emulator-5554" }
```

Response:

```json
{ "fingerprint": "<sha256_hex>", "activity": "com.example.app.MainActivity" }
```

Notes:
- Uses get_ui_tree and (on Android) get_current_screen as inputs.
- Normalises visible, interactable or structurally significant elements (class/type, resourceId, text, contentDesc).
- Trims and lowercases text, filters out likely dynamic values (timestamps, counters).
- Sorts deterministically (top-to-bottom, left-to-right) and limits elements to 50.
- Returns fingerprint: null and an error message if the UI tree or activity cannot be retrieved.

Guidance:
- Use as a baseline for `wait_for_screen_change`.
- Use fingerprints to define expected screens for `expect_screen`.

---

## start_log_stream / read_log_stream / stop_log_stream
Start a background adb logcat stream and retrieve parsed NDJSON entries.

read_log_stream response example:

```json
{ "entries": [ { "timestamp": "2026-03-20T...Z", "level": "ERROR", "tag": "AppTag", "pid": 1234, "message": "FATAL EXCEPTION" } ], "crash_summary": { "crash_detected": true } }
```

## App readiness

`get_app_readiness` observes at most two fresh hierarchies; `wait_for_app_ready`
waits for settled evidence within one budget. Require `platform`; optionally
select `deviceId`. Each call pins its device and keeps its sampling history local.

| Control | Default | Accepted integer range |
| --- | --- | --- |
| `timeoutMs` | get: 15000; wait: 30000 | 100–60000 |
| `stabilityMs` | 500 | 100–10000 |
| `pollIntervalMs` (wait only) | 500 | 100–1000 |

```json
{ "platform": "android", "deviceId": "emulator-5554", "timeoutMs": 30000 }
```

Both return `success`, resolved `device`, `readiness`, `elapsed_ms`, and a
`failure_code` on failure. Get succeeds when it establishes loading, transitioning,
or settled; wait succeeds only for settled. Codes are `READINESS_UNAVAILABLE`,
`READINESS_TIMEOUT`, and `DEVICE_UNAVAILABLE`. Invalid/unknown inputs are rejected.

`readiness.state` is loading, transitioning, settled, or unknown. Visible native
progress indicators establish loading; exact Loading / Please wait labels
(ignoring case, whitespace and trailing dots/ellipsis) are heuristic loading.
Loading takes priority over unchanged trees. Two different valid signatures show
transitioning; consecutive identical signatures spanning the stability window
show settled. Failed, empty, stale-session, wrong-device, or invalid observations
cannot establish stability and break sample continuity. Broad legacy loading
keywords such as a button named Progress are not sufficient loading evidence.

The summary includes `basis` (observed/heuristic/insufficient), `scope: device_ui`,
latest successful capture time and snapshot session/revision, attempted sample
count, `stable_for_ms`, up to eight signal-code evidence records, limitations,
and capability flags. Evidence excludes UI text and full trees. Unresponsive and
debugger-paused detection are explicitly unsupported on both platforms; neither
slow hierarchy retrieval nor a deadline expiry proves either state.

Tree responses (including compact and nested trees) add a single-sample readiness
summary without extra reads. Such a summary reports loading or unknown; it does
not inherit stability from an earlier request. Existing loading/delta fields and
compact error evidence are preserved.

Readiness describes normalized foreground UI during the capture window. It does
not verify foreground app identity, process health, business outcome, or backend
completion, and does not guarantee the UI will stay unchanged. A screenshot alone
never establishes readiness. Network observation windows and device input are
untouched. Timeouts include `DEADLINE_EXCEEDED`; the latest read failing makes
current state unknown. Sampling and subprocess cleanup respect outer budgets.
Transport cancellation does not currently abort platform reads immediately;
reads remain bounded by their operation deadlines.

See [readiness-aware waits](interact.md#readiness-aware-waits) to combine this
signal with a specific UI predicate.
