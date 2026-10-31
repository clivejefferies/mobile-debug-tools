# Mobile Debug MCP
[![npm version](https://img.shields.io/npm/v/mobile-debug-mcp.svg)](https://www.npmjs.com/package/mobile-debug-mcp)

Build, install, control, and inspect Android and iOS apps from an MCP-compatible
client. Mobile Debug MCP connects your client to local device toolchains and
provides UI actions, screenshots, logs, state assertions, and optional Android
performance capture and runtime debugging.

Android, iOS, and Kotlin Multiplatform projects are supported. Flutter and React
Native have not been tested. Platform and device limitations are described in the
[tool reference](docs/tools/TOOLS.md).

## Start here

Choose how to connect:

1. **[Agent plugin](#agent-plugin) — Recommended.** Installs the server configuration
   and usage skill together for supported agent clients.
2. **[Direct MCP configuration](#mcp-configuration).** Connect the published server
   to another MCP-compatible client.
3. **[Manual setup](#manual-setup).** Build and run a local source checkout.

Check the [requirements](#requirements) for your platform, then follow
[Getting started](#getting-started) to select a device and verify an interaction.

## Requirements

- Node.js >= 22
- [Android SDK](https://developer.android.com/studio) (adb) for Android support
- Xcode and its command-line tools on macOS for iOS support
- [idb](https://github.com/facebook/idb) for iOS UI inspection and interaction
- JDK 17+ for optional [Android runtime debugging](docs/tools/debugger.md)

## Environment setup

The server discovers platform tools from standard locations and `PATH`. Leave
path overrides unset for a standard installation. Use them for non-standard
locations, multiple toolchains, or a pinned development environment.

| Variable | Purpose |
| --- | --- |
| `ADB_PATH` | Path to `adb`. |
| `ANDROID_SDK_ROOT` or `ANDROID_HOME` | Android SDK root. |
| `XCRUN_PATH` | Path to `xcrun`. |
| `MCP_IDB_PATH` or `IDB_PATH` | Path to `idb`. |
| `GRADLE_JAVA_HOME` or `JAVA_HOME` | Java home for Gradle-backed operations. |

After connecting the client, call `get_system_status` to check discovery and
prerequisites. See [environment diagnostics](docs/tools/system.md) if a toolchain
or device is unavailable.

## Agent plugin

The preferred setup for supported agent clients is the
[agent plugin](agent-plugin/README.md). It installs the MCP server configuration
and usage skill together. Choose your client below.

<details>

<summary>Codex plugin</summary>

Install the plugin from this repository's marketplace:

```bash
codex plugin marketplace add clivejefferies/mobile-debug-tools
codex plugin add mobile-debug-tools@mobile-debug-tools
```

</details>

<details>

<summary>Claude Code plugin</summary>

Install the plugin from this repository's marketplace:

```bash
claude plugin marketplace add clivejefferies/mobile-debug-tools
claude plugin install mobile-debug-tools@mobile-debug-tools
```

</details>

<details>

<summary>Cursor plugin</summary>

The repository includes a [Cursor marketplace](.cursor-plugin/marketplace.json).
Teams and Enterprise admins can import the repository in Dashboard → Plugins & MCPs → Team
Marketplaces. To test it locally, copy [agent-plugin](agent-plugin/) into
`~/.cursor/plugins/local/mobile-debug-tools`, then reload Cursor.

</details>

Start a new chat or session after installation so the client loads the skill
and MCP tools. Each plugin launches the published npm package locally and needs
Node.js 22 or newer and the platform toolchains for your device. If you also
registered the MCP server directly, disable that registration to avoid
duplicate tools.

## MCP configuration

For a standard installation, add this stdio server to your client's MCP settings:

```json
{
  "mcpServers": {
    "mobile-debug": {
      "command": "npx",
      "args": ["--yes", "mobile-debug-mcp"]
    }
  }
}
```

If your client uses separate fields, choose stdio, set the command to `npx`, and
supply `--yes` and `mobile-debug-mcp` as arguments. The examples below add optional
path overrides; replace the placeholder paths before using them.

<details>

<summary>Android setup</summary>

Recommended when you want Android only, or when you want to make the Android toolchain explicit.

```json
{
  "mcpServers": {
    "mobile-debug": {
      "command": "npx",
      "args": ["--yes", "mobile-debug-mcp"],
      "env": {
        "ADB_PATH": "/path/to/adb",
        "ANDROID_SDK_ROOT": "/path/to/android/sdk",
        "GRADLE_JAVA_HOME": "/path/to/jdk"
      }
    }
  }
}
```

For Android-only setups, `XCRUN_PATH` and `IDB_PATH` are not required unless you want to pin them explicitly.

</details>

<details>

<summary>iOS setup</summary>

Recommended when you want iOS simulator or device support, or when `idb` lives in a non-standard location.

```json
{
  "mcpServers": {
    "mobile-debug": {
      "command": "npx",
      "args": ["--yes", "mobile-debug-mcp"],
      "env": {
        "XCRUN_PATH": "/usr/bin/xcrun",
        "MCP_IDB_PATH": "/path/to/idb",
        "IDB_PATH": "/path/to/idb"
      }
    }
  }
}
```

For iOS-only setups, `ADB_PATH` and `ANDROID_SDK_ROOT` are not required unless you want to pin them explicitly.

</details>

## Manual setup

For a local source checkout, follow the [development setup](CONTRIBUTING.md#local-development)
to install dependencies and build the server. Then configure your MCP client to
launch that build over stdio:

```json
{
  "mcpServers": {
    "mobile-debug": {
      "command": "node",
      "args": ["/absolute/path/to/mobile-debug-mcp/dist/server.js"]
    }
  }
}
```

Replace the path with your checkout location. Rebuild after source changes.
Continue with [Getting started](#getting-started) once your client connects.

## Getting started

This walkthrough takes you from a connected MCP client to a verified interaction
with an installed app. Complete the [requirements and client
configuration](#start-here) first. The examples use Android; use
`"platform": "ios"` and a discovered simulator ID for supported iOS operations.

Tool names label MCP calls. Submit the JSON through your client's tool interface,
or ask the client to perform the described step. These are not shell commands.
Replace device IDs, app identifiers, and example UI labels with your own values.

### 1. Check the environment and select a device

Call `get_system_status` with `{}`. Read the platform summary and resolve missing
prerequisites before continuing. Then call `list_devices`:

```json
{ "platform": "android" }
```

Choose a connected device and pass its ID in subsequent calls. Explicit targeting
keeps observations and actions on the same device, especially when several are
connected. If discovery fails, see [environment diagnostics](docs/tools/system.md).

### 2. Launch your app

With the app already installed, call `start_app`:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "appId": "com.example.app"
}
```

If you need to build or install it first, follow [app management](docs/tools/manage.md).
A successful launch reports execution, so inspect the resulting screen before
assuming the app has reached the state you need.

### 3. Inspect the screen

Call `capture_screenshot` for a visual view, or `get_ui_tree` for element labels,
identifiers, and exposed control state. Both accept:

```json
{ "platform": "android", "deviceId": "emulator-5554" }
```

Use a selector from the observed UI for the next action. Prefer a stable resource
or accessibility identifier when available. For loading screens, see
[app readiness](docs/tools/observe.md#app-readiness); a fresh capture may still show a
transition.

### 4. Act and verify the result

For example, if the tree exposes a button labelled Settings, call `tap_element`:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "selector": { "text": "Settings" }
}
```

Then assert a visible element that identifies the destination. If your Settings
screen contains an Account heading, call `expect_element_visible`:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "selector": { "text": "Account" },
  "timeout_ms": 15000
}
```

Choose an assertion that represents your app's intended outcome. A delivered tap
alone does not prove navigation succeeded. Use [UI waits](docs/tools/interact.md#wait_for_ui)
when you need to resolve a target or synchronize before continuing, and
[assertions](docs/tools/interact.md#expect_element_visible) to check the result.

### When a step fails

Read the tool's error and inspect the current UI before retrying an action with
uncertain delivery. Refine an ambiguous selector or allow enough observation time
for the device. If the UI does not explain the failure, collect
[logs or a debug snapshot](docs/tools/observe.md). Use [evidence
correlation](docs/tools/correlated-evidence.md) to associate those observations with a
specific action.

For setup problems, return to [environment diagnostics](docs/tools/system.md). For slow
Android flows, see [system traces](docs/tools/system-traces.md); for paused runtime
inspection, see [Android runtime debugging](docs/tools/debugger.md).

## Documentation

- [Documentation guide](docs/README.md) — find the guide for your task.
- [Tool reference](docs/tools/TOOLS.md) — inputs, responses, examples, and shared principles.
- [Contributing](CONTRIBUTING.md) — develop the server and run its checks.
- [Changelog](docs/CHANGELOG.md) — release history.

## License

[Apache-2.0](LICENSE)
