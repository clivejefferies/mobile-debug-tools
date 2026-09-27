# Mobile Debug Tools
[![npm version](https://img.shields.io/npm/v/mobile-debug-mcp.svg)](https://www.npmjs.com/package/mobile-debug-mcp)

A minimal, secure MCP server for AI-assisted mobile development. Build, install, interact and inspect Android/iOS apps from an MCP-compatible client.

> **Support:**
> * KMP
> * Android
> * iOS
> * Flutter - not tested
> * React native - not tested

## Requirements

- Node.js >= 18
- [Android SDK](https://developer.android.com/studio) (adb) for Android support
- Xcode command-line tools for iOS support
- [idb](https://github.com/facebook/idb) for iOS device support

## Environment Setup

The server discovers Android and iOS tools automatically from standard locations by default. Manual environment setup is still supported, but it should be treated as the fallback for non-standard installs, overrides, or reproducible pinned toolchains.

Use explicit paths when:
- you have multiple SDKs installed
- the tools live outside standard locations
- you want deterministic setup across machines
- automatic discovery does not find the expected binary

Leave the variables unset when:
- the tools are already on `PATH`
- the standard Android and Xcode locations are enough

Common environment variables:
- `ADB_PATH`: explicit path to `adb`
- `ANDROID_SDK_ROOT` or `ANDROID_HOME`: Android SDK root
- `XCRUN_PATH`: explicit path to `xcrun`
- `MCP_IDB_PATH` or `IDB_PATH`: explicit path to `idb`
- `GRADLE_JAVA_HOME` or `JAVA_HOME`: Java home for Gradle-backed operations

For normal use, call `get_system_status` first. It reports the detected host, Android, and iOS toolchain state so the client can decide whether automatic discovery is sufficient or whether explicit overrides are needed.

## Configuration

<details>

<summary>Android setup</summary>

Recommended when you want Android only, or when you want to make the Android toolchain explicit.

```json
{
  "mcpServers": {
    "mobile-debug": {
      "command": "npx",
      "args": ["--yes","mobile-debug-mcp","server"],
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
      "args": ["--yes","mobile-debug-mcp","server"],
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

<details>

<summary>Codex</summary>

Use STDIO

command: npx

args: 
* --yes
* mobile-debug-mcp

environment variables:
* ADB_PATH: /path/to/adb
* XCRUN_PATH: /usr/bin/xcrun
* IDB_PATH: /path/to/idb
* MCP_IDB_PATH: /path/to/idb
* ANDROID_SDK_ROOT: /path/to/android/sdk
* GRADLE_JAVA_HOME: /path/to/jdk
* JAVA_HOME: /path/to/jdk

If you are unsure whether the environment is configured correctly, run `get_system_status` first. It reports the detected host, Android, and iOS toolchain state in a structured form.

</details>

## Usage

Examples: 

Crash fixing:
> I have a crash on the app, can you diagnose it, fix and validate using the mcp tools available

Feature building:
> Add a button, hook into the repository and confirm API request successful

## Docs

- Tools: [Tools](docs/tools/TOOLS.md) — full input/response examples
- Changelog: [Changelog](docs/CHANGELOG.md)
- Agents: [AGENTS.md](AGENTS.md) — cold-start guidance for autonomous agents entering the public repo
- Skills: [skills/README.md](skills/README.md) — portable Markdown skill packages for agents such as Copilot, Codex, Claude, or custom systems

## License

MIT
