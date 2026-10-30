# App management

[Documentation](../README.md) · [Tool reference](TOOLS.md)

Use these tools to select a device, build and install an app, and control its
lifecycle. For a first launch, follow [Getting started](../../README.md#getting-started).

After `start_app` or `restart_app`, [inspect the resulting UI](observe.md) and
[assert the expected screen or element](interact.md#expect_screen). If the app
is still loading, use a [readiness check](observe.md#app-readiness) or an
appropriate [UI wait](interact.md#wait_for_ui) before continuing.

## On this page

- [List devices](#list_devices).
- [Build an app](#build_app).
- [Install an existing artifact](#install_app).
- [Launch, stop, restart, or reset an app](#start_app--terminate_app--restart_app--reset_app_data).

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
- Standard toolchains are discovered automatically. Use [path overrides](../../README.md#environment-setup) when discovery needs help. Gradle-backed builds require a suitable Java installation.
- iOS setup typically needs `XCRUN_PATH` and `MCP_IDB_PATH` or `IDB_PATH` when `idb` is not on `PATH`.

---

## install_app
Install a built artifact, or build and install from a project directory.
`platform`, `projectType`, and `appPath` are required. `projectType` is one of
`native`, `kmp`, `react-native`, or `flutter`; acceptance of a project type does
not establish tested support for every framework.

Input:

```json
{ "platform": "android", "projectType": "native", "appPath": "/path/to/app.apk", "deviceId": "emulator-5554" }
```

Response:

```json
{ "device": { "platform": "android", "id": "emulator-5554" }, "installed": true, "output": "Performing Streamed Install\nSuccess" }
```

Notes:
- Android: prefers `ADB_PATH` if set, otherwise falls back to `adb` on `PATH`, and will also use `ANDROID_SDK_ROOT`/`ANDROID_HOME` when present.
- iOS: uses `xcrun simctl install` for simulators and `idb` where available for devices; point `MCP_IDB_PATH` or `IDB_PATH` at a non-standard `idb` binary.

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
  "timestamp": "2026-04-23T08:00:00.000Z",
  "action_type": "start_app",
  "device": { "platform": "android", "id": "emulator-5554", "osVersion": "14", "model": "Pixel", "simulator": true },
  "target": { "selector": { "appId": "com.example.app" }, "resolved": null },
  "success": true,
  "ui_fingerprint_before": "fp_before",
  "ui_fingerprint_after": "fp_after",
  "details": {
    "launch_time_ms": 1000,
    "output": "Events injected: 1",
    "device_id": "emulator-5554",
    "observed_app": {
      "appId": "com.example.app",
      "package": "com.example.app",
      "activity": "com.example.app.MainActivity",
      "screen": "MainActivity",
      "matchedTarget": true
    }
  }
}
```

restart_app returns the same action envelope shape with `action_type: "restart_app"`.

terminate_app and reset_app_data return operation-specific lifecycle results instead of the action envelope.

Notes:

- `start_app` and `restart_app` report execution success, not outcome correctness.
- Use `details.observed_app` as the quick decision signal for what the tool actually saw after launch.
- Android launch feedback usually includes package/activity matching; iOS launch feedback includes launch output and PID when available.
- When the landing screen is known, use `expect_screen` as the final verification step.
- If launch timing is uncertain, use a UI wait or readiness check before the final assertion.

`terminate_app`, `restart_app`, and `reset_app_data` also require `platform` and
`appId`, with optional `deviceId`. Resetting app data removes application state;
use it only when a clean app state is intended. Execution controls apply to
`start_app` and `restart_app`; see [verification modes](interact.md#interaction-execution-controls-rfc-018).
