# Build configuration

Use the existing platform adapters rather than constructing a second build path.
The owning implementation is the source of truth for accepted overrides.

## Android

[prepareGradle()](../../../../src/utils/android/utils.ts) selects the project
wrapper when present and prepares Java and platform-tools in the child environment.
[AndroidManage](../../../../src/manage/android.ts) executes that command.

| Setting | Current use |
| --- | --- |
| `MCP_GRADLE_TASK` | Gradle task; defaults to `assembleDebug` |
| `MCP_GRADLE_WORKERS`, then `MCP_BUILD_JOBS` | Supplies `--max-workers` |
| `MCP_GRADLE_CACHE=0` | Disables Gradle caching |
| `ANDROID_STUDIO_JDK`, `ANDROID_STUDIO_JBR`, `JAVA_HOME` | Java selection; see [toolchain details](toolchain-details.md) |

The current Android build adapter does not implement `MCP_GRADLE_RETRIES` or
`MCP_GRADLE_TIMEOUT_MS`. Do not assume iOS watchdog controls apply to Gradle.

## iOS

[iOSManage](../../../../src/manage/ios.ts) discovers the workspace/project and
scheme, then supplies simulator destination, derived-data and result-bundle paths.

| Setting | Current use |
| --- | --- |
| `XCODEBUILD_PATH` | Build executable; defaults to `xcodebuild` |
| `MCP_XCODE_DESTINATION_UDID`, then `MCP_XCODE_DESTINATION` | Simulator destination when not supplied in options |
| `MCP_DERIVED_DATA` | Derived-data path when not supplied in options |
| `MCP_XCODE_RESULTBUNDLE_PATH` | Result bundle; otherwise generated uniquely per run |
| `MCP_XCODE_JOBS` | Build parallelism; defaults to 4 unless supplied in options |
| `MCP_FORCE_CLEAN=1` | Requests clean unless explicitly supplied in options |
| `MCP_XCODEBUILD_TIMEOUT` | Watchdog duration in milliseconds; defaults to 180000 |
| `MCP_XCODEBUILD_RETRIES` | Watchdog retries; current parsing falls back to 1 |

## Installation and diagnostics

Preserve adapter-specific install fallbacks and errors. Use the
[management reference](../../../../docs/tools/manage.md) for public tool contracts.
Record exact commands, output, exit status and artifact paths when investigating
failures; see [diagnostics](diagnostics-schema.md). Keep environment snapshots
limited to relevant variables and redact secrets.
