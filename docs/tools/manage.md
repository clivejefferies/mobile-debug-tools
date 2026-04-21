# Manage (build & device management)

This document covers tools that perform project builds, device selection, installation, and app lifecycle operations.

For app launch and restart flows, agents should use:

**ACT -> WAIT (if needed) -> EXPECT**

For example:

1. `start_app` or `restart_app`
2. optional `wait_for_screen_change`
3. `expect_screen` when the expected landing screen is known

## list_devices
Enumerate connected Android devices and iOS simulators.

Input (optional):

```json
{ "platform": "android" }
```

Response:

```json
{ "devices": [ { "id": "emulator-5554", "platform": "android", "osVersion": "11", "model": "sdk_gphone64_arm64", "simulator": true, "appInstalled": false } ] }
```

Notes:
- When multiple devices are attached, pass `deviceId` to other tools to target a specific device.

---

## build_app
Build a project and return the path to the generated artifact.

Input:

```json
{ "platform": "android", "projectType": "kmp", "projectPath": "/path/to/project", "variant": "Debug" }
```

Response:

```json
{ "artifactPath": "/path/to/build/output/app.apk" }
```

Notes:
- Requires `platform`, `projectType`, and `projectPath`.
- Android builds prefer the project `gradlew` when present.
- iOS builds honor environment-based Xcode destination and derived-data settings where configured.

---

## build_and_install (buildAndInstallHandler)
Orchestrates build then install and returns streamed NDJSON events plus a final result object.

This is a documented repository helper, not part of the main public MCP tool list in `toolDefinitions`.

Input:

```json
{ "projectPath": "/path/to/project", "platform": "android", "deviceId": "emulator-5554", "projectType": "kmp" }
```

NDJSON events (example stream):

```json
{"type":"build","status":"started","platform":"android"}
{"type":"build","status":"finished","artifactPath":"/path/to/app.apk"}
{"type":"install","status":"started","artifactPath":"/path/to/app.apk","deviceId":"emulator-5554"}
{"type":"install","status":"finished","artifactPath":"/path/to/app.apk","device":{"platform":"android","id":"emulator-5554"}}
```

Final result:

```json
{ "success": true, "artifactPath": "/path/to/app.apk", "device": { "platform": "android", "id": "emulator-5554" }, "output": "Performing Streamed Install\nSuccess" }
```

Notes:
- If `projectType` === `kmp`, the handler prefers Android by default. Set `platform` explicitly to override.
- If `MCP_DISABLE_AUTODETECT=1`, callers MUST provide `platform` or `projectType`.

---

## install_app
Install an app onto a connected device or simulator.

Input:

```json
{ "platform": "android", "appPath": "/path/to/app.apk", "deviceId": "emulator-5554" }
```

Response:

```json
{ "device": { "platform": "android", "id": "emulator-5554" }, "installed": true, "output": "Performing Streamed Install\nSuccess" }
```

Notes:
- Android: prefers `ADB_PATH` if set, otherwise falls back to `adb` on PATH.
- iOS: uses `xcrun simctl install` for simulators and `idb` where available for devices.

---

## start_app / terminate_app / restart_app / reset_app_data
Standard app lifecycle operations.

start_app input example:

```json
{ "platform": "android", "appId": "com.example.app", "deviceId": "emulator-5554" }
```

start_app response example:

```json
{
  "action_id": "start_app_1710000000000_1",
  "timestamp": 1710000000000,
  "action_type": "start_app",
  "target": { "selector": { "appId": "com.example.app" }, "resolved": null },
  "success": true,
  "ui_fingerprint_before": "fp_before",
  "ui_fingerprint_after": "fp_after"
}
```

restart_app returns the same action envelope shape with `action_type: "restart_app"`.

terminate_app and reset_app_data return operation-specific lifecycle results instead of the action envelope.

Notes:

- `start_app` and `restart_app` report execution success, not outcome correctness.
- When the landing screen is known, use `expect_screen` as the final verification step.
- If launch timing is uncertain, insert `wait_for_screen_change` before `expect_screen`.
