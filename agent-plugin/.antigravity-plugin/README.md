# Mobile Debug Tools for Antigravity

Inspect and interact with Android and iOS apps using a local MCP server and the
bundled `mobile-debug-mcp` usage skill. Capture screenshots, logs and UI trees;
verify interactions with explicit evidence. Android additionally supports optional
runtime debugging and bounded Perfetto system traces. iOS runtime debugging and
system traces are not supported.

## Prerequisites

- Node.js 22 or newer, with `npx` on PATH and npm registry access on first launch.
- Android SDK/platform-tools and an authorized device or running emulator for Android.
- macOS and the applicable Xcode/idb tooling for iOS.
- Host JDK 17+ and a debuggable Android app for optional runtime debugging.

The server runs locally through `npx`; its exact version is pinned in
`mcp_config.json`. The plugin uses the client-managed `${PLUGIN_DATA}` directory as its working directory.
No plugin-specific account, API key, OAuth sign-in or hosted backend is required.

## Install and use

Install the extracted plugin directory with `agy plugin install /path/to/mobile-debug-tools`.
Run `agy plugin list --json` and confirm one skill (`mobile-debug-mcp`) and one
MCP server (`mobile-debug-mcp`) are discovered. Start a new session. Disable a
separate manual registration of the same MCP server to avoid duplicate tools.

Example prompts:

- Check my mobile debugging environment and connected devices.
- Inspect the current screen of my mobile app.
- Help me reproduce and diagnose a bug in my mobile app.

For a first check, select an explicit emulator/device, inspect its current screen,
and verify a harmless interaction using fresh UI evidence. Readiness is a probe;
a dispatched action alone does not establish an app outcome.

## Access and support

Tools can read device screens, logs and shallow debugger locals; they can also
interact with apps and manage their lifecycle. These may contain private data.
Use only devices and apps you intend to inspect. Build/install/reset operations
have their own effects and should be requested explicitly. Trace contents and
artifacts stay local; this plugin adds no automatic upload service.

Source and setup: https://github.com/clivejefferies/mobile-debug-tools
Tool reference: https://github.com/clivejefferies/mobile-debug-tools/blob/main/docs/tools/TOOLS.md
Support: https://github.com/clivejefferies/mobile-debug-tools/issues
License: Apache-2.0. Publisher attribution: mobile-debug-tools contributors.
