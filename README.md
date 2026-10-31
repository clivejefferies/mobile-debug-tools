# Mobile Debug Tools
[![npm version](https://img.shields.io/npm/v/mobile-debug-mcp.svg)](https://www.npmjs.com/package/mobile-debug-mcp)

Build, install, control, and inspect Android and iOS apps from an MCP-compatible
client. Mobile Debug Tools connects your client to local device toolchains and
provides UI actions, screenshots, logs, state assertions, and optional Android
performance capture and runtime debugging.

Android, iOS, and Kotlin Multiplatform projects are supported. Flutter and React
Native have not been tested. Platform and device limitations are described in the
[tool reference](docs/tools/TOOLS.md).

## What you can use it for

Mobile Debug Tools gives a coding agent access to a running app, so development
can include feedback from the device as well as the source code. For example:

- **Build and test a feature.** After adding a settings screen, build and install
  the app, navigate to it, and check that its controls display and behave as
  expected. See [app management](docs/tools/manage.md) and
  [UI interactions and assertions](docs/tools/interact.md).
- **Check a bug fix or regression.** Reproduce a sequence such as opening a form,
  entering text and submitting it, then verify the resulting screen or control
  state. Repeat the journey after a code change to check the outcome.
- **Review the UI on a device.** Capture screenshots to inspect layout and visual
  changes, or inspect the UI hierarchy for exposed labels and control state.
  See [observations](docs/tools/observe.md).
- **Investigate an app failure.** Collect logs, screenshots and a debug snapshot
  around a failing action to understand what happened. [Evidence
  correlation](docs/tools/correlated-evidence.md) links observations to the action.
- **Investigate Android performance or runtime behaviour.** Capture a
  [Perfetto trace](docs/tools/system-traces.md) during a slow flow, or attach the
  [runtime debugger](docs/tools/debugger.md) to a debuggable app to inspect
  breakpoints, call stacks and locals.

## How it works

Your agent client launches a local MCP server and communicates with it over
stdio. The server translates tool calls into operations through Android's ADB
or Apple's Xcode tools and idb, then returns device observations and action
results to the client. It connects to emulators, simulators and supported
physical devices through those toolchains.

The agent plugin bundles the server configuration and usage skill. The same
server can also be configured directly in an MCP client or run from a source
checkout. See [code structure](docs/code-structure.md#module-ownership) for the
implementation's module boundaries.

## Start here

Choose how to connect:

1. **[Agent plugin](#agent-plugin) — Recommended.** Installs the server configuration
   and usage skill together for supported agent clients.
2. **[Direct MCP configuration](#mcp-configuration).** Connect the published server
   to another MCP-compatible client.
3. **[Manual setup](#manual-setup).** Build and run a local source checkout.

Check the [requirements](#requirements) for your platform before installing.

## Requirements

- Node.js >= 22
- [Android SDK](https://developer.android.com/studio) (adb) for Android support
- Xcode and its command-line tools on macOS for iOS support
- [idb](https://github.com/facebook/idb) for iOS UI inspection and interaction
- JDK 17+ for optional [Android runtime debugging](docs/tools/debugger.md)

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

## Documentation

- [Documentation guide](docs/README.md) — find the guide for your task.
- [Tool reference](docs/tools/TOOLS.md) — inputs, responses, examples, and shared principles.
- [Contributing](CONTRIBUTING.md) — develop the server and run its checks.
- [Changelog](docs/CHANGELOG.md) — release history.

## License

[Apache-2.0](LICENSE)
