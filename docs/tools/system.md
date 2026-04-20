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
- If `success: false`, attempt recovery steps or report issues to the user.

## get_network_capture_status

Report whether mitmdump-based capture is installed, configured, and currently running.

Response highlights:
- `mitmdumpAvailable`
- `mitmdumpPath`
- `running`
- `captureFileConfigured`
- `captureFile`
- `logFile`
- `proxyHost`
- `proxyPort`
- `recentTlsFailureHosts`
- `issues`

## start_network_capture

Start mitmdump with the bundled addon and configure the capture file used by `get_network_activity`.

Input example:

```json
{ "host": "127.0.0.1", "port": 8080 }
```

Response example:

```json
{
  "success": true,
  "started": true,
  "proxyHost": "127.0.0.1",
  "proxyPort": 8080,
  "captureFile": "/tmp/mobile-debug-network-capture.ndjson",
  "mitmdumpPath": "mitmdump"
}
```

## stop_network_capture

Stop the active mitmdump capture process started by `start_network_capture`.

## get_network_certificate_status

Inspect whether the local mitmproxy CA exists, whether Android can launch the certificate installer, and whether recent proxy runs hit TLS trust failures.

Response highlights:
- `certificateFileAvailable`
- `certificateFile`
- `certInstallerAvailable`
- `lockScreenDisabled`
- `recentTlsFailureHosts`
- `issues`

## prepare_network_certificate_install

Push the mitmproxy CA certificate to an Android device and launch the system certificate installer.

Input example:

```json
{
  "deviceId": "emulator-5554",
  "pin": "1234"
}
```

Behavior notes:
- If Android has no secure lock screen yet, provide `pin` so the tool can configure one before launching the installer.
- On non-rooted Android devices, the final CA install confirmation still happens on-device. Android does not allow silent CA installation into the user trust store.
