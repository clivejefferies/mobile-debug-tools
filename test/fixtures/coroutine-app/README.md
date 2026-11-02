# Isolated Android coroutine debugger fixture

Separate disposable package `dev.mobiledebugmcp.coroutinefixture`; the runner
refuses to replace an existing installation. No server dependency, debug agent,
automatic download or production app instrumentation is introduced.

Requires Node 22+, JDK 17, Android SDK platform/build-tools 36, Kotlin JVM compiler
and matching stdlib 2.0.21, and kotlinx-coroutines-core-jvm 1.9.0. Provide local
paths explicitly:

```sh
export JAVA_HOME=/path/to/jdk-17
export MCP_KOTLINC=/path/to/kotlin/bin/kotlinc
export MCP_KOTLIN_STDLIB=/path/to/kotlin/lib/kotlin-stdlib.jar
export MCP_COROUTINES_CORE=/path/to/kotlinx-coroutines-core-jvm-1.9.0.jar
npm run build
MCP_COROUTINE_DEVICE=emulator-5554 npx tsx test/device/automated/debugger/coroutine.android.test.ts
```

`npm run test:device` discovers the runner and reports **UNRUN** unless
`MCP_COROUTINE_DEVICE` is set. A configured run with missing prerequisites fails;
it cannot silently pass. Do not run other fixture journeys concurrently on the
same serial. A physical device must be selected explicitly and reported separately.

The source owns two named single-thread dispatcher executors, an explicit gate,
nested async work and a cancellation/finally path. UI controls release the gate
only after debugger resume. Compiler line/variable tables are captured for generated
continuation classes as well as ordinary methods. The assessment compares existing
MCP stops, thread stacks and shallow locals; none represents a reconstructed
logical coroutine stack. A bounded step attempt is recorded as an observation,
not a promise to follow work across suspension. Source breakpoints are tested
independently as a workaround.

The runner checks pause guards, old frame rejection, event-wait cancellation,
completion/cancellation UI recovery and owned ADB forward cleanup. Finally it
removes its package and temporary build/signing output. SIGKILL/host loss cannot
execute finally; inspect outstanding sessions/packages manually after such loss.
Local output includes synthetic fixture values, source/APK/server/dependency hashes
and compiler metadata. Redirect stdout/stderr to an intentional local evidence
file; no data is uploaded automatically.

See the [accepted specification](../../../docs/specs/030-android-coroutine-validation/spec.md)
and [implementation/verification record](../../../docs/specs/030-android-coroutine-validation/plan.md).
