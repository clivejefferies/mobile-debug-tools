

# Specification 016 — Environment Auto-Configuration and Toolchain Discovery

## Purpose

Enable the Mobile Debug MCP to automatically discover, validate, and configure its required platform toolchains, reducing manual setup while maintaining deterministic behaviour.

The MCP should work out of the box on a standard development machine whenever the required tooling is installed, with manual configuration becoming an optional override rather than a prerequisite.

---

# Goals

- Eliminate manual executable path configuration for standard installations.
- Automatically discover Android and iOS toolchains.
- Validate the runtime environment before execution.
- Expose structured diagnostics for missing or invalid dependencies.
- Support partial platform availability.
- Preserve deterministic behaviour across supported operating systems.

---

# Non-Goals

This specification does not:

- Install Android Studio, Xcode, SDKs, or platform tooling.
- Modify operating system configuration.
- Automatically accept security prompts or permissions.
- Download missing dependencies.
- Replace platform package managers.

---

# Supported Host Matrix

| Host OS | Android discovery | iOS discovery | Expected behaviour |
|---|---:|---:|---|
| macOS | Supported | Supported | Discover and validate Android and iOS toolchains independently. |
| Linux | Supported | Unsupported | Discover and validate Android tooling. Report iOS as unsupported without failing Android readiness. |
| Windows | Supported | Unsupported | Discover and validate Android tooling. Report iOS as unsupported without failing Android readiness. |

Unsupported hosts shall return `HOST_OS_UNSUPPORTED` for all platform discovery requests.

iOS discovery shall only run on macOS. On Linux and Windows, iOS status shall be reported as:

```json
{
  "platform": "ios",
  "status": "unsupported",
  "failure": {
    "code": "PLATFORM_UNAVAILABLE",
    "tool": null,
    "message": "iOS tooling is only supported on macOS."
  }
}
```

# Scope

## Android

- Android SDK
- adb
- emulator
- Java runtime where required by Gradle-backed operations
- Gradle installation where required by Gradle-backed operations

## iOS

- Xcode
- xcrun
- simctl
- idb
- idb_companion
- LLDB

## Shared

- Host operating system support
- Platform availability
- Executable versions
- Connected devices
- Running emulators/simulators
- Capability readiness

---

# Runtime Behaviour

Toolchain discovery and validation shall be available through `get_system_status`.

Startup validation shall remain opt-in for compatibility with the current runtime.

When `MOBILE_DEBUG_MCP_STARTUP_HEALTHCHECK=1`, the server shall:

1. Discover available toolchains.
2. Validate required executables.
3. Determine supported capabilities.
4. Publish platform readiness to startup diagnostics.
5. Continue operating whenever at least one platform is usable.

When `MOBILE_DEBUG_MCP_STARTUP_HEALTHCHECK` is unset or not equal to `1`, the server shall not perform eager validation during startup. Discovery shall instead run when `get_system_status` or a platform-dependent tool first requires it.

The server shall not fail simply because one platform is unavailable.

`get_system_status` is the authoritative public surface for environment readiness. This specification extends that existing tool rather than introducing a replacement tool.

---

# Discovery Priority

Every executable and toolchain root shall be resolved using the following deterministic order.

1. Explicit tool-specific environment variable.
2. Explicit toolchain-root environment variable.
3. Operating system `PATH`.
4. Known platform installation locations.
5. Tool-specific discovery command.
6. Structured setup failure.

The following overrides shall remain first-class and take precedence over all automatic discovery:

| Concern | Supported override |
|---|---|
| adb executable | `ADB_PATH` |
| Android SDK root | `ANDROID_SDK_ROOT`, then `ANDROID_HOME` |
| xcrun executable | `XCRUN_PATH` |
| idb client executable | `MCP_IDB_PATH`, then `IDB_PATH` |
| idb companion executable | `IDB_COMPANION_PATH` |
| Java home for Gradle-backed operations | `GRADLE_JAVA_HOME`, then `JAVA_HOME` |
| Gradle home | `GRADLE_HOME` |

If multiple supported overrides are present for the same concern, the order shown in the table shall determine precedence.

An explicitly configured path that does not exist, is not executable, or fails validation shall not silently fall back to automatic discovery. It shall return a structured failure so configuration errors remain visible and deterministic.

# Tool Version Policy

Version validation shall be deterministic and tool-specific.

| Tool | Minimum supported version | Version command | Parsing rule | Unsupported when |
|---|---|---|---|---|
| adb | 1.0.41 | `adb version` | Parse the first semantic version following `Android Debug Bridge version`. | Missing, unparsable, or lower than 1.0.41. |
| xcrun | Host Xcode version | `xcodebuild -version` via resolved Xcode toolchain | Parse `Xcode <major>.<minor>[.<patch>]`. | Xcode is missing, unparsable, or older than Xcode 15.0. |
| simctl | Host Xcode version | `xcrun simctl help` and resolved Xcode version | Treat successful execution as compatible with the validated Xcode version. | Command fails under a supported Xcode installation. |
| idb | 1.1.7 | `idb --version` | Parse the first semantic version in stdout or stderr. | Missing, unparsable, or lower than 1.1.7. |
| idb_companion | 1.1.7 | `idb_companion --version` | Parse the first semantic version in stdout or stderr. | Missing, unparsable, lower than 1.1.7, or incompatible with the selected `idb` major/minor version. |
| LLDB | Host Xcode version | `xcrun lldb --version` | Parse the first numeric version token and record the raw string. | Command fails under a supported Xcode installation. |
| Java | 17 | `java -version` | Parse the Java feature version, including legacy and modern formats. | Missing, unparsable, or feature version lower than 17. |
| Gradle | 8.0 | `gradle --version` or project wrapper `./gradlew --version` | Parse `Gradle <major>.<minor>[.<patch>]`. | Missing when required, unparsable, or lower than 8.0. |

The implementation may raise minimum versions in a later specification revision, but shall not silently change them without updating this table and the associated tests.

When a version string cannot be parsed, the tool shall return `TOOL_VERSION_UNSUPPORTED` with the raw version output included in diagnostics.

---

# Capability Detection

Discovery shall determine available capabilities rather than simply locating executables.

Capabilities shall be reported per platform.

Android capabilities may include:

- `device_discovery`
- `install_app`
- `launch_app`
- `ui_interaction`
- `screenshot`
- `log_capture`
- `debug`

iOS capabilities may include:

- `device_discovery`
- `install_app`
- `launch_app`
- `ui_interaction`
- `screenshot`
- `log_capture`
- `debug`

Agents shall not need to know which underlying provider implements a capability.

# Provider Selection

Multiple providers may satisfy the same capability.

The MCP shall select the highest-priority available provider for each capability.

Initial provider mapping:

| Platform | Capability | Provider priority |
|---|---|---|
| Android | device discovery | adb |
| Android | install app | adb |
| Android | launch app | adb |
| Android | UI interaction | adb-backed runtime |
| Android | screenshot | adb |
| Android | debug | JDWP |
| iOS | device discovery | idb, then simctl |
| iOS | install app | idb, then simctl where supported |
| iOS | launch app | idb, then simctl |
| iOS | UI interaction | idb |
| iOS | screenshot | idb, then simctl |
| iOS | debug | LLDB |

Provider selection shall be deterministic and included in `get_system_status` output.

A platform may be partially ready when only a subset of capabilities has an available provider.

---

# Environment Validation

Validation shall confirm:

- executable exists
- executable is runnable
- version is supported
- required companion processes or binaries are available
- host platform prerequisites are satisfied
- connected devices are discoverable
- emulator/simulator state is readable

A missing booted device shall not make the platform toolchain unavailable when device discovery itself is functional. It shall instead affect device-dependent capabilities.

Examples:

- `xcrun` and `simctl` available with no booted simulator: iOS toolchain ready, device-dependent capabilities unavailable until a simulator is booted or device is connected.
- `adb` available with no connected device: Android toolchain ready, device-dependent capabilities unavailable until a device or emulator is connected.

# Diagnostic Contract

All discovery and validation failures shall use the following shape:

```json
{
  "code": "TOOL_NOT_FOUND",
  "platform": "ios",
  "tool": "idb",
  "message": "idb could not be resolved.",
  "searchedLocations": [
    "MCP_IDB_PATH",
    "IDB_PATH",
    "PATH",
    "/opt/homebrew/bin/idb",
    "/usr/local/bin/idb"
  ],
  "selectedProvider": null,
  "rawVersion": null,
  "remediation": [
    "Install fb-idb using pipx.",
    "Set MCP_IDB_PATH to the idb executable if it is installed in a non-standard location."
  ]
}
```

Required fields:

- `code`
- `platform`
- `tool`
- `message`
- `searchedLocations`
- `selectedProvider`
- `rawVersion`
- `remediation`

Fields may be `null` when not applicable, but shall not be omitted.

Raw shell errors may be recorded internally for diagnostics, but shall not be exposed directly as the public failure contract.

---

# Partial Availability

Platform readiness shall be reported independently.

| Android state | iOS state | Expected result |
|---|---|---|
| ready | unavailable | Android capabilities remain usable. iOS-dependent tools fail with `PLATFORM_UNAVAILABLE`. |
| unavailable | ready | iOS capabilities remain usable. Android-dependent tools fail with `PLATFORM_UNAVAILABLE`. |
| partially_ready | ready | Available Android capabilities remain usable; unavailable Android capabilities fail with `NO_SUPPORTED_PROVIDER` or `DEVICE_NOT_FOUND` as appropriate. |
| ready | partially_ready | Available iOS capabilities remain usable; unavailable iOS capabilities fail with `NO_SUPPORTED_PROVIDER` or `DEVICE_NOT_FOUND` as appropriate. |
| unavailable | unavailable | Server remains available for non-platform MCP tools, while all platform-dependent tools fail deterministically. |

A platform status shall be one of:

- `ready`
- `partially_ready`
- `unavailable`
- `unsupported`

# Runtime Introspection

`get_system_status` shall expose the environment summary using this minimum structure:

This change is additive and backwards compatible.

The existing flat `get_system_status` fields shall remain present and retain their current meanings for the duration of this specification. The new nested `host`, `android`, and `ios` objects shall be added alongside those legacy fields.

The implementation shall not remove, rename, or repurpose any existing flat field as part of Specification 016.

Where a legacy flat field and a new nested field represent the same value, both shall be populated from the same internal source of truth to prevent divergence.

```json
{
  "host": {
    "os": "macos",
    "supported": true
  },
  "android": {
    "status": "ready",
    "tools": {},
    "providers": {},
    "capabilities": {},
    "devices": [],
    "failures": []
  },
  "ios": {
    "status": "partially_ready",
    "tools": {},
    "providers": {},
    "capabilities": {},
    "devices": [],
    "failures": []
  }
}
```

For an unsupported host operating system, `get_system_status` shall return the following minimum shape while preserving all legacy flat fields:

```json
{
  "host": {
    "os": "freebsd",
    "supported": false
  },
  "android": {
    "status": "unsupported",
    "tools": {},
    "providers": {},
    "capabilities": {},
    "devices": [],
    "failures": [
      {
        "code": "HOST_OS_UNSUPPORTED",
        "platform": "android",
        "tool": null,
        "message": "Host operating system 'freebsd' is not supported.",
        "searchedLocations": [],
        "selectedProvider": null,
        "rawVersion": null,
        "remediation": [
          "Run Mobile Debug MCP on macOS, Linux, or Windows."
        ]
      }
    ]
  },
  "ios": {
    "status": "unsupported",
    "tools": {},
    "providers": {},
    "capabilities": {},
    "devices": [],
    "failures": [
      {
        "code": "HOST_OS_UNSUPPORTED",
        "platform": "ios",
        "tool": null,
        "message": "Host operating system 'freebsd' is not supported.",
        "searchedLocations": [],
        "selectedProvider": null,
        "rawVersion": null,
        "remediation": [
          "Run Mobile Debug MCP on macOS, Linux, or Windows."
        ]
      }
    ]
  }
}
```

Each resolved tool entry shall include:

- resolved path
- discovery source
- parsed version
- raw version output
- validation status

Each capability entry shall include:

- availability
- selected provider
- blocking failure, if unavailable

---

# Compatibility

This specification extends the existing `get_system_status` surface additively.

It does not introduce a replacement status tool, and it does not make a breaking response-shape change.

All existing flat fields remain supported and unchanged. The new nested `host`, `android`, and `ios` fields are added alongside them.

Removal of the legacy flat fields requires a separate deprecation specification and shall not occur as part of Specification 016.

The following existing configuration inputs remain supported:

- `ADB_PATH`
- `ANDROID_SDK_ROOT`
- `ANDROID_HOME`
- `XCRUN_PATH`
- `MCP_IDB_PATH`
- `IDB_PATH`
- `IDB_COMPANION_PATH`
- `GRADLE_JAVA_HOME`
- `JAVA_HOME`
- `GRADLE_HOME`
- `MOBILE_DEBUG_MCP_STARTUP_HEALTHCHECK`

Environment variables become optional overrides rather than mandatory configuration, except where the user intentionally supplies one. An invalid explicit override shall fail validation and shall not be ignored.

---

# Failure Modes

The implementation shall return deterministic setup failures including:

- `HOST_OS_UNSUPPORTED`
- `TOOL_NOT_FOUND`
- `TOOL_NOT_EXECUTABLE`
- `TOOL_VERSION_UNSUPPORTED`
- `PLATFORM_UNAVAILABLE`
- `DEVICE_NOT_FOUND`
- `NO_SUPPORTED_PROVIDER`
- `TOOL_VALIDATION_FAILED`

Failure selection rules:

- Unsupported host operating system: `HOST_OS_UNSUPPORTED`.
- Explicit path missing or not executable: `TOOL_NOT_EXECUTABLE`.
- Tool cannot be resolved from any allowed source: `TOOL_NOT_FOUND`.
- Version is below minimum or unparsable: `TOOL_VERSION_UNSUPPORTED`.
- Host supports the platform but required foundational tooling is absent: `PLATFORM_UNAVAILABLE`.
- Toolchain is valid but no device or simulator is available for a device-dependent operation: `DEVICE_NOT_FOUND`.
- Platform is available but no provider can satisfy a requested capability: `NO_SUPPORTED_PROVIDER`.
- Tool exists but its validation command fails for another reason: `TOOL_VALIDATION_FAILED`.

---

# Acceptance Criteria

The implementation is complete when all of the following are true.

## Host Support

- Android discovery works on macOS, Linux, and Windows.
- iOS discovery works on macOS only.
- iOS is reported as `unsupported` on Linux and Windows without affecting Android readiness.

## Discovery and Overrides

- A default installation requires no executable path configuration when supported tools are installed in standard locations.
- Every override listed in this specification is honoured using the documented precedence.
- Invalid explicit overrides fail deterministically and do not silently fall back.

## Validation

- Every supported tool is version-checked using the command and parsing rule defined in this specification.
- Unsupported or unparsable versions return `TOOL_VERSION_UNSUPPORTED` with `rawVersion` populated.
- Missing devices affect device-dependent capabilities without incorrectly marking the whole toolchain unavailable.

## Status Surface

- `get_system_status` returns host, platform, tool, provider, capability, device, and failure information using the specified structure.
- Existing flat `get_system_status` fields remain present, unchanged, and populated from the same internal source of truth as the new nested fields.
- Unsupported host operating systems return `HOST_OS_UNSUPPORTED` for both platform objects using the exact diagnostic contract defined in this specification.
- Provider selection is visible and deterministic.
- Partial platform availability is represented using `ready`, `partially_ready`, `unavailable`, or `unsupported`.

## Concrete Pass/Fail Cases

1. `ADB_PATH` points to a non-existent file:
   - Android reports `TOOL_NOT_EXECUTABLE`.
   - Automatic adb discovery does not run.

2. `adb` is found on `PATH` but `adb version` returns an unsupported or unparsable version:
   - Android reports `TOOL_VERSION_UNSUPPORTED`.
   - `rawVersion` contains the command output.

3. `xcrun` and `simctl` are valid but no simulator is booted:
   - iOS toolchain status is `partially_ready` or `ready` according to available non-device capabilities.
   - Device-dependent operations return `DEVICE_NOT_FOUND`.

4. Android is ready and iOS foundational tooling is absent on macOS:
   - Android tools continue to function.
   - iOS tools return `PLATFORM_UNAVAILABLE`.

5. iOS is ready and Android foundational tooling is absent:
   - iOS tools continue to function.
   - Android tools return `PLATFORM_UNAVAILABLE`.

6. `MOBILE_DEBUG_MCP_STARTUP_HEALTHCHECK` is unset:
   - Server startup does not eagerly validate toolchains.
   - `get_system_status` performs discovery and returns readiness.

7. `MOBILE_DEBUG_MCP_STARTUP_HEALTHCHECK=1`:
   - Startup diagnostics run using the same discovery and validation contract as `get_system_status`.

## Backwards Compatibility

- Existing valid environment-variable configurations continue to work.
- Existing `get_system_status` consumers remain supported, with new fields added in a backwards-compatible manner where possible.

---

# Future Work

Potential future enhancements include:

- Interactive `doctor` command built on the same diagnostic contract.
- Automatic emulator and simulator startup.
- Toolchain health monitoring.
- Self-healing actions such as restarting adb, reconnecting devices, or refreshing simulator state.
- Installation guidance and package manager integration.
- Configurable version policies for enterprise environments.