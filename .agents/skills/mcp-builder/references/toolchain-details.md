# Toolchain details

This reference documents the exact heuristics and commands used by the mcp-builder skill to detect and validate the native toolchain (Android & iOS) on contributor machines.

Key environment variables
- ADB_PATH: explicit path to adb binary
- ANDROID_SDK_ROOT / ANDROID_HOME: SDK root; platform-tools/adb under these
- ANDROID_STUDIO_JBR / ANDROID_STUDIO_JDK: explicit Android Studio JBR/JDK path
- JAVA_HOME: system JDK
- IDB_PATH / MCP_IDB_PATH: idb path for iOS
- XCRUN_PATH: explicit xcrun path
- MCP_PREFERS_JBR: boolean to prefer Android Studio JBR when present

Android Java detection precedence
1. ANDROID_STUDIO_JBR / ANDROID_STUDIO_JDK env vars (preferred when MCP_PREFERS_JBR set)
2. Known Android Studio JBR locations (macOS):
   - /Applications/Android Studio.app/Contents/jbr/Contents/Home
   - /Applications/Android Studio Preview.app/Contents/jbr/Contents/Home
3. Explicit JAVA_HOME (validate via `java -version`)
4. macOS `/usr/libexec/java_home -v 17` or `-v 21`
5. Common Linux JDK locations: `/usr/lib/jvm/*temurin*`, `/usr/lib/jvm/*zulu*`

Validation rules
- Accept only Java 17 or Java 21 for Gradle builds in this project (both tested/known working).
- Reject GraalVM / Java 23 that causes Gradle jlink errors. If detected, return suggestion: "Prefer an Apple/Temurin/JBR Java 17 or 21. Set ANDROID_STUDIO_JBR or JAVA_HOME to a supported JDK."

ADB resolution precedence
1. process.env.ADB_PATH (explicit)
2. ANDROID_SDK_ROOT or ANDROID_HOME -> platform-tools/adb
3. Common SDK locations (macOS/Linux): $HOME/Library/Android/sdk/platform-tools, /opt/android-sdk/platform-tools
4. `command -v adb` / `which adb` on PATH
5. fallback to `adb` (best-effort)

IDB / XCRUN detection (iOS)
- IDB: check MCP_IDB_PATH -> IDB_PATH -> common locations (/opt/homebrew/bin/idb, /usr/local/bin/idb, $HOME/Library/Python/*/bin/idb). Validate by running `idb --version` or `idb list-targets --json`.
- XCRUN: check XCRUN_PATH -> run `xcrun --version`.

How to probe (commands)
- adb: `adb --version` and `adb devices --print` (or `adb devices -l`) to list.
- java: `java -XshowSettings:properties -version` or `java -version` parse first line.
- xcrun: `xcrun --version`
- idb: `idb --version` or `idb list-targets --json`

Output format
- Each probe returns { name, cmd, ok, version?, suggestion? } so agents can reason programmatically.
- Include env snapshot (PATH, JAVA_HOME, ADB_PATH, ANDROID_SDK_ROOT, IDB_PATH, XCRUN_PATH) to aid diagnostics.

Notes & rationale
- Prefer Android Studio JBR (JBR is bundled & known-good) because developer machines often have mismatched system JDKs (e.g., Graal). Allow override via env for CI.
- For long-running server processes, prepend java/bin and platform-tools to spawn env PATH when running child builds so external PATH/JAVA_HOME changes don't require a server restart.

Examples
- Detected result (JSON):
  {
    "name": "adb",
    "cmd": "/Users/xxx/Library/Android/sdk/platform-tools/adb",
    "ok": true,
    "version": "Android Debug Bridge version 1.0.41"
  }

- Java suggestion when incompatible:
  { "name": "java", "ok": false, "suggestion": "Found GraalVM (Java 23). Use Java 17 or 21: set ANDROID_STUDIO_JBR or JAVA_HOME." }
