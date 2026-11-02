# Isolated Android debugger fixture

[Contributing](../../../CONTRIBUTING.md) · [Documentation](../../../docs/README.md)

Package `dev.mobiledebugmcp.debugfixture`, built with `android:debuggable=true`
and Java source/line/local metadata. Calculate exposes `known=42`, an increment
call for into/over/out stepping, and a visible `Result 43` after resume. Late class
loads a second class reflectively to check pending source breakpoints. NoLocals
is compiled with source/line tables and no variable tables to verify explicit ART
metadata uncertainty.

Build helper uses SDK platform/build-tools 36, the existing direct javac/D8/aapt2
pattern, ephemeral signing material and temporary output. It does not modify other
apps or display settings. The automated journey installs/removes only this fixture
and checks session-owned ADB forwards. See [debugger tools](../../../docs/tools/debugger.md).

## Kotlin locals validation

The opt-in Kotlin variant compiles `MainActivity.kt` instead of the Java sources
into the same disposable package. Do not run the variants concurrently on one
device. It requires a Kotlin JVM compiler (`MCP_KOTLINC`, or `kotlinc` on PATH),
the matching standard-library jar (`MCP_KOTLIN_STDLIB`), and a compatible JDK.
Kotlin 2.0.21 with JDK 17 was used for the recorded validation. The fixture does
not add Gradle, download a compiler, or change the server's dependencies.

```sh
npm run build
export JAVA_HOME=/path/to/jdk-17
export MCP_KOTLINC=/path/to/kotlin/bin/kotlinc
export MCP_KOTLIN_STDLIB=/path/to/kotlin/lib/kotlin-stdlib.jar
MCP_KOTLIN_DEVICE=emulator-5554 npx tsx test/device/automated/debugger/kotlin.android.test.ts
```

The compiler retains its default line/local metadata; D8 runs without shrinking
or obfuscation. The runner checks the class-file local-variable scope tables,
then reads `seed=7` before `known` is initialized, `known=42` before `answer` is
initialized, and `answer=43` afterward through MCP. Old references must fail as
stale. Resume/detach is followed by a fresh hierarchy assertion for
`Kotlin result 43`; exact owned forwards, package and temporary files are cleaned
up. Build failures also remove their temporary directory.

`npm run test:device` includes this journey only when `MCP_KOTLIN_DEVICE` is set;
otherwise it reports **UNRUN** explicitly. The existing Java journey separately
covers absent variable tables. A local outside its compiler scope and missing
metadata are different conditions; an empty ART table alone proves neither.
See the [dated validation record](../../../docs/specs/029-kotlin-locals-validation/report.md).

## Interaction regression journey

The same isolated fixture is also used by the [interaction device check](../../device/automated/interact/interaction.android.test.ts)
for clickable waits, stored handles, selector taps, visibility and enabled-state
assertions. Run it after building the server:

```sh
MCP_INTERACTION_DEVICE=emulator-5554 npx tsx test/device/automated/interact/interaction.android.test.ts
```

It also runs in `npm run test:device` when `MCP_INTERACTION_DEVICE` or
`MCP_DEBUGGER_DEVICE` selects a device. Fixture journeys run sequentially and
remove their own package and temporary build outputs. This check does not attach
a debugger or modify another app's data.

The interaction journey also exercises a labelled native SeekBar. It adjusts
from 25 toward 75, checks convergence within tolerance, and confirms the displayed
value with a fresh hierarchy assertion. The same fixture cleanup applies.
