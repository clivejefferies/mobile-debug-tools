# Toolchain discovery

Inspect the owning helper before changing discovery or adding an override. Build
adapters use these helpers; a separate probe should report the selected executable
and its actual output, rather than infer success from an environment variable.

## Android Java

[detectJavaHome()](../../../../src/utils/java.ts) checks explicit
`ANDROID_STUDIO_JDK`, then `ANDROID_STUDIO_JBR`, known Android Studio JBR locations,
and `JAVA_HOME`, followed by macOS and Linux fallback locations. The version
checks accept Java 17 or 21 for Android builds. Exact fallback locations live in
the helper rather than being duplicated here.

Use `java -version` on the selected executable. Distinguish Gradle’s selected JDK
from the shell Java version and the optional debugger worker’s Java requirements;
see [the debugger reference](../../../../docs/tools/debugger.md).

## adb

[resolveAdbCmd()](../../../../src/utils/android/utils.ts) checks, in order:

1. An explicit nonempty `ADB_PATH`.
2. `adb` on `PATH`.
3. `ANDROID_SDK_ROOT` or `ANDROID_HOME` with `platform-tools/adb`.
4. The macOS user SDK location.
5. A final `adb` fallback, whose availability still needs checking.

Probe with `adb version` and `adb devices -l`. Use an explicit serial for device
journeys and record whether it is a physical device or an emulator.

## iOS

The [iOS command helpers](../../../../src/utils/ios/utils.ts) resolve idb through
configured overrides and the current installation. `MCP_IDB_PATH` takes precedence
over `IDB_PATH`; inspect `getConfiguredIdbPath()` for configuration-file fallbacks.
`getXcrunCmd()` uses `XCRUN_PATH` or `xcrun`.

Probe the selected binaries with `idb --version`, `idb list-targets --json`,
`xcrun --version`, or `xcrun simctl list devices booted` as appropriate. A working
simulator probe does not establish physical-iOS-device support.

## Reporting

Record executable paths, relevant versions, device identities and the commands
that actually ran. Capture only relevant environment variables and redact secrets.
Use the [diagnostic report guidance](diagnostics-schema.md), keeping supplemental
diagnostics separate from public MCP responses. For available build settings,
continue with [build configuration](build-flags.md).
