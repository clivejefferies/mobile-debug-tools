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
- **Investigate mobile performance or runtime behaviour.** Capture a
  [Perfetto or iOS simulator Instruments trace](docs/tools/system-traces.md) during a slow flow, or attach the
  [runtime debugger](docs/tools/debugger.md) to a debuggable app to inspect
  breakpoints, call stacks and locals on Android or an iOS simulator.

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
- JDK 17+ for optional [Android runtime debugging](docs/tools/debugger.md); Xcode’s Swift-enabled LLDB/Python for optional iOS simulator debugging

## Agent plugin

The plugin installs the MCP server configuration and the `mobile-debug-mcp` usage
skill together. These are GitHub/local installation routes; they do not require
approval from a client's public curated marketplace.

<details>

<summary>Codex</summary>

In a terminal with a current Codex CLI:

```bash
codex plugin marketplace add clivejefferies/mobile-debug-tools --ref main
codex plugin add mobile-debug-tools@mobile-debug-tools
codex plugin list
```

Start a new chat/session and confirm the plugin is enabled and its skill and MCP
tools are available. These commands use the repository's marketplace, named
`mobile-debug-tools`, not a public directory listing. See the
[official packaging instructions](https://developers.openai.com/plugins/build/plugins).

</details>

<details>

<summary>Claude Code</summary>

Run these shell commands (not slash commands inside a chat):

```bash
claude plugin marketplace add clivejefferies/mobile-debug-tools --scope user
claude plugin install mobile-debug-tools@mobile-debug-tools --scope user
claude plugin list
```

Restart the session after installation. In an interactive Claude Code chat, the
corresponding commands start with `/plugin` instead of `claude plugin`. See
[Claude Code's installation guide](https://code.claude.com/docs/en/discover-plugins).

</details>

<details>

<summary>Cursor</summary>

For local installation, clone this repository and run these commands from its
root in a macOS/Linux shell:

```bash
git clone https://github.com/clivejefferies/mobile-debug-tools.git
cd mobile-debug-tools
cursor_plugin_dir="$HOME/.cursor/plugins/local/mobile-debug-tools"
if [ -e "$cursor_plugin_dir" ]; then
  echo "Move the existing plugin directory aside before copying the new package."
else
  mkdir -p "$(dirname "$cursor_plugin_dir")"
  cp -R agent-plugin/cursor "$cursor_plugin_dir"
fi
```

On Windows, copy the contents of `agent-plugin/cursor` into a new
`~/.cursor/plugins/local/mobile-debug-tools` folder, including `.cursor-plugin`.
Use this generated Cursor-native package, not the portable parent: Cursor does
not expand `${PLUGIN_DATA}` in portable `mcp.json`. Do not symlink to the checkout.

Run **Developer: Reload Window**, open **Customize**, and confirm the skill and
MCP server are loaded. For Teams/Enterprise distribution, import this repository
under **Dashboard → Plugins & MCPs → Team Marketplaces**; its
[Cursor catalog](.cursor-plugin/marketplace.json) selects the native package.
Members install from Customize. See [Cursor's plugin guide](https://cursor.com/docs/plugins).

</details>

<details>

<summary>Antigravity</summary>

Install the [Antigravity CLI](https://antigravity.google/docs/getting-started?tab=cli),
then clone this GitHub repository and export its plugin:

```bash
git clone https://github.com/clivejefferies/mobile-debug-tools.git
cd mobile-debug-tools
npm run package:antigravity -- "$PWD/antigravity-dist"
agy plugin validate --strict "$PWD/antigravity-dist"
agy plugin install "$PWD/antigravity-dist"
agy plugin list --json
```

No `npm install` is needed for the export script. Choose a new output directory;
the exporter refuses to overwrite an existing one. Check the installed entry has
one skill (`mobile-debug-mcp`) and one MCP server (`mobile-debug-mcp`), then start
a new session and approve the specific MCP calls you intend to use.

The Antigravity-only export avoids strict-validation warnings from the other
clients' compatibility files. It uses `mcp_config.json` and the same pinned npm
server and shared skill. GitHub/local installation does not require the
Antigravity Marketplace interest form. See [Google's plugin guide](https://antigravity.google/docs/build-plugins).

</details>

Each client needs Node.js 22 or newer, `npx` on its PATH, npm registry access on
first launch, and the platform toolchains for your device. After installation,
ask the agent to list devices, select an explicit emulator/device, and inspect
its screen. An installed component list alone does not prove a working device
connection. Disable any separate manual registration of this MCP server in the
same client to avoid duplicate tools. If a plugin command is unavailable, update
the client; the [direct MCP configuration](#mcp-configuration) works independently.

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

Android debugger errors include bounded, sanitized failure classifications and recovery guidance; see the [debugger guide](docs/tools/debugger.md#failure-diagnostics).

## Documentation

- [Documentation guide](docs/README.md) — find the guide for your task.
- [Tool reference](docs/tools/TOOLS.md) — inputs, responses, examples, and shared principles.
- [Contributing](CONTRIBUTING.md) — develop the server and run its checks.
- [Changelog](docs/CHANGELOG.md) — release history.

## License

[Apache-2.0](LICENSE)

Launch and interaction results distinguish dispatch from timestamped
[device readiness evidence](docs/tools/observe.md#device-readiness-evidence).
Readiness waits account for observed sleeping/locked device blockers. Unknown or
unsupported signals are explicit, and no automatic unlock is performed.
