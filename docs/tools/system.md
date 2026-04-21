# System (environment & health checks)

Tools that provide a lightweight view of the local mobile debugging environment and surface issues early so agents can decide whether to proceed.

## get_system_status
A fast, non-throwing healthcheck that inspects key dependencies and connections required for mobile debugging.

Input:

```
{}
```

Response (example):

```json
{
  "success": true,
  "adbAvailable": true,
  "adbVersion": "8.1.0",
  "devices": 1,
  "deviceStates": "1 device",
  "logsAvailable": true,
  "envValid": true,
  "issues": [],
  "appInstalled": true,
  "iosAvailable": true,
  "iosDevices": 1
}
```

Checks performed (fast, best-effort):
- ADB availability and version (adb --version)
- Connected Android devices (adb devices -l), counts and state summary (device/unauthorized/offline)
- Log access probe (adb logcat -d -t 1)
- Android environment variables (ANDROID_SDK_ROOT / ANDROID_HOME / PATH contains adb)
- Optional: app installation check if MCP_TARGET_PACKAGE/MCP_TARGET_APP_ID is set (pm path)
- Basic iOS checks (xcrun --version and simctl list devices booted)

Behavior notes:
- Always returns structured JSON and never throws; any failures are surfaced in the `issues` array.
- Designed to be fast (<~1s probes where possible); startup callers may prefer a `fastMode` variant that only checks existence.
- Useful to call at the start of an agent session to gate subsequent actions.

Usage guidance:
- Call before build/install flows to avoid wasted build attempts on misconfigured systems.
- Call early in a session when device or toolchain availability is uncertain.
- If `success: false`, attempt recovery steps or report issues to the user.
