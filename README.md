# Mobile Debug Tools

A minimal, secure MCP server for AI-assisted mobile development. Build, install, and inspect Android/iOS apps from an MCP-compatible client.

> **Support:**
> * Android support
> * iOS only tested on simulator
> * KMP support
> * Flutter iOS projects not fetching logs
> * React native not tested

## Requirements

- Node.js >= 18
- [Android SDK](https://developer.android.com/studio) (adb) for Android support
- Xcode command-line tools for iOS support
- [idb](https://github.com/facebook/idb) for iOS device support

## Configuration example

```json
{
  "mcpServers": {
    "mobile-debug": {
      "command": "npx",
      "args": ["--yes","mobile-debug-mcp","server"],
      "env": { "ADB_PATH": "/path/to/adb", "XCRUN_PATH": "/usr/bin/xcrun", "IDB_PATH": "/path/to/idb" }
    }
  }
}
```
You will need to add ADB_PATH for Android and XCRUN_PATH and IDB_PATH for iOS.

## Usage

Examples: 

Crash fixing:
> I have a crash on the app, can you diagnose it, fix and validate using the mcp tools available

Feature building:
> Add a button, hook into the repository and confirm API request successful

## Docs

- Tools: [Tools](docs/tools/TOOLS.md) — full input/response examples
- Changelog: [Changelog](docs/CHANGELOG.md)

## Testing

- `npm run test:unit` runs every automated unit test under `test/unit/...`
- `npm run test:device` runs the automated device smoke checks under `test/device/automated/...`
- Manual and debug-oriented device scripts live under `test/device/manual/...` and are not part of the default test commands

## License

MIT
