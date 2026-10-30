# Environment diagnostics

[Documentation](../README.md) · [Tool reference](TOOLS.md)

Check local toolchains and connected devices before building, installing, or
interacting with an app. If discovery cannot find a tool, configure the relevant
[path override](../../README.md#environment-setup), then check again. Once the
required platform is available, continue with [device selection](manage.md#list_devices)
or the [getting-started walkthrough](../../README.md#getting-started).

## get_system_status
A fast, non-throwing healthcheck that inspects key dependencies and connections required for mobile debugging.

Input:

```
{}
```

Response (selected fields):

```json
{
  "success": true,
  "status": "ready",
  "adbAvailable": true,
  "adbVersion": "8.1.0",
  "devices": 1,
  "deviceStates": "1 device",
  "logsAvailable": true,
  "envValid": true,
  "issues": [],
  "appInstalled": true,
  "iosAvailable": true,
  "iosDevices": 1,
  "summary": {
    "overall": "ready",
    "android": {
      "ready": true,
      "summary": "1 Android device(s) connected; log access available",
      "blockers": []
    },
    "ios": {
      "ready": true,
      "summary": "1 iOS simulator(s) booted",
      "blockers": []
    },
    "gradle": {
      "ready": true,
      "summary": "No explicit Gradle JDK override detected",
      "blockers": [],
      "suggestedFixes": []
    }
  }
}
```

The response is additive: the existing flat fields remain available, and the nested `host`, `android`, and `ios` objects are added alongside them.

Checks performed (fast, best-effort):
- ADB availability and version (adb --version)
- Connected Android devices (adb devices -l), counts and state summary (device/unauthorized/offline)
- Log access probe (adb logcat -d -t 1)
- Android environment variables and discovery order (`ADB_PATH`, then `ANDROID_SDK_ROOT`/`ANDROID_HOME`, then `PATH`)
- Optional: app installation check if MCP_TARGET_PACKAGE/MCP_TARGET_APP_ID is set (pm path)
- Basic iOS checks (`XCRUN_PATH`, `MCP_IDB_PATH`/`IDB_PATH`, and `simctl` booted-device discovery)

Behavior notes:
- Always returns structured JSON and never throws; any failures are surfaced in the `issues` array.
- `status` gives a quick overall gate: `ready`, `degraded`, or `blocked`.
- `summary.android`, `summary.ios`, and `summary.gradle` provide the fastest path to the actual blocker category.
- The public tool accepts an empty input object; it exposes no `fastMode` option.
- Probes are best-effort and can take longer when native tooling is slow.
- Useful to call at the start of an agent session to gate subsequent actions.

Usage guidance:
- Call before build/install flows to avoid wasted build attempts on misconfigured systems.
- Call early in a session when device or toolchain availability is uncertain.
- `success: false` can reflect issues on a platform you are not using. Inspect the
  relevant platform status and blockers before deciding whether to proceed.

Recommended setup patterns:
- Default: let the server discover tools automatically from standard locations and call `get_system_status` first to confirm what is available.
- Android: set `ADB_PATH` only if you want to override the discovered `adb` binary, or set `ANDROID_SDK_ROOT`/`ANDROID_HOME` when discovery needs help finding `platform-tools/adb`.
- iOS: set `XCRUN_PATH` only if Xcode tools are not on `PATH`, and set `MCP_IDB_PATH` or `IDB_PATH` only when `idb` lives outside the default search paths.
