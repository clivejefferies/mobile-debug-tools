# Build flags and runtime configuration

Purpose: describe the flags, environment variables and spawn-environment handling that agents should use when orchestrating Android and iOS builds for this repo.

Common env variables
- MCP_GRADLE_RETRIES (default: 1) — number of retry attempts on watchdog kills for Gradle
- MCP_GRADLE_TIMEOUT_MS (default: 300000) — gradle watch/duration timeout
- MCP_XCODEBUILD_RETRIES, MCP_XCODEBUILD_TIMEOUT_MS — similar for xcodebuild
- MCP_PREFERS_JBR — prefer Android Studio JBR for JAVA_HOME
- MCP_DERIVED_DATA, MCP_XCODE_RESULTBUNDLE_PATH — override DerivedData/result bundle locations

Android (Gradle)
- Use the Gradle wrapper if present: `./gradlew assemble<Variant>` (e.g., assembleDebug). Prefer wrapper to ensure consistent Gradle version.
- Prepare spawn env by prepending javaBin and platform-tools dir to PATH and set GRADLE_JAVA_HOME and `-Dorg.gradle.java.home` when necessary.
- If wrapper exists, ensure `chmod +x ./gradlew` before spawn.
- Recommended flags:
  - `--no-daemon` sometimes helpful in CI, but wrap with existing project conventions.
  - Set `org.gradle.jvmargs` via env or gradle.properties only if needed.
- Timeouts & watchdog:
  - Use a watchdog timeout (MCP_GRADLE_TIMEOUT_MS) and retry (MCP_GRADLE_RETRIES) if killed by watchdog. Record stdout/stderr for each attempt.

iOS (xcodebuild)
- Use `xcodebuild -workspace <ws> -scheme <scheme> -configuration Debug -sdk iphonesimulator build` for simulator builds.
- Provide `-derivedDataPath` and `-resultBundlePath` to isolate builds and produce diagnostics. Default result bundle path should be unique per run to avoid collisions.
- Recommended flags: `-parallelizeTargets -jobs <N>` where N is from MCP_XCODE_JOBS or sensible default (4).
- When a destination UDID is available, always pass `-destination "platform=iOS Simulator,id=<UDID>"` to avoid ambiguous device selection.
- Timeouts & retries: respect MCP_XCODEBUILD_TIMEOUT_MS and MCP_XCODEBUILD_RETRIES; capture stdout/stderr and save logs under build-results.

Install-time behavior
- Android: prefer `adb install -r <apk>` for fast installs. If output contains spurious lines (e.g., "Performing Streamed Install" followed by "Success"), parse to extract final status. On failure try `adb push` to `/data/local/tmp` + `pm install -r <remote>` as a fallback collect push/install diagnostics.
- iOS: prefer `xcrun simctl install <device> <app>` for simulator. On failure attempt idb install if idb exists: `idb install <ipa|app> --udid <udid>` and record its stdout/stderr.

Diagnostics capture
- Save stdout/stderr, exitCode and environment snapshot for each command. Persist logs under workspace/build-results or a temp dir provided by the caller.
- For builds, also capture produced artifact paths to return to caller.

Examples
- Gradle invocation (pseudo):
  spawnOpts.env.PATH = `${javaBin}:${platformTools}:${process.env.PATH}`
  spawn('./gradlew', ['assembleDebug'], { cwd: projectRoot, env: spawnOpts.env })

- xcodebuild invocation (pseudo):
  xcodebuild -workspace MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath /tmp/derived -resultBundlePath /tmp/Result-123.xcresult -parallelizeTargets -jobs 4 build
