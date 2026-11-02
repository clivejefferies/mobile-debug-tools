# Kotlin locals validation — issue #83

[Documentation](../../README.md) · [Debugger tools](../../tools/debugger.md) ·
[Fixture and reproduction](../../../test/fixtures/debugger-app/README.md)

Date: 2026-11-02. Source: [issue #83](https://github.com/clivejefferies/mobile-debug-tools/issues/83).

## Scope and method

The issue originated from empty locals observed while debugging Modul8. The
maintainer clarified in this chat: “you dont need modul8, that is just where we
found it”. Validation therefore uses an isolated Kotlin calculation, without
building, modifying or debugging Modul8. This is lightweight validation/test
work under the shared process, with no new debugger contract or capability.

Hypothesis: plain Kotlin arguments and initialized named locals are inspectable
through the existing Android debugger; absence before initialization is a scope
condition, not sufficient evidence of a worker defect.

The Kotlin variant of the existing disposable Android fixture uses
`dev.mobiledebugmcp.debugfixture.MainActivity.calculate(seed: Int)`. The same
build helper compiles the checked-in source and installs its generated APK.
Compiler local-variable tables are checked using `javap -p -c -l`; source/APK
and server fingerprints are recorded by the runner. No app instrumentation,
debug probes, coroutine support or production server change is introduced.

| Source stop (`MainActivity.kt`) | Expected observation |
| --- | --- |
| Line 28, before `known = seed + 35` | `seed=7`; `known` absent |
| Line 29, before `answer = known + 1` | `known=42`; `answer` absent |
| Line 30, before setting result text | `known=42`; `answer=43` |

The runner verifies actual source/method/line stops, reads stack/frame IDs and
locals using compact MCP calls, and checks that an earlier stop/frame is stale.
After removing breakpoints and resuming, detach must report complete cleanup
and preserve unrelated forwards. A fresh UI-tree assertion of `Kotlin result 43`
independently establishes execution recovery. Finally removes only the fixture
package and temporary build directory.

## Evidence and interpretation

Initial focused device journey: **PASS**, emulator-5554, Android 16/API 36,
Node 22.23.4, Kotlin JVM compiler/stdlib 2.0.21, Oracle JDK 17.0.11.
All three scope observations, stale-reference rejection, UI recovery and owned
forward cleanup passed. Log: `/tmp/mobile-debug-83-kotlin.log`.

Server fingerprint (dist plus Java sources):
`fd2f526b5ee310ba485dcb2c3d060a06fe221b24afe511fa669347586f3a3a42`.
Kotlin source SHA-256:
`79bab4babbfeb216f01fc6e53fc5400f6d0082628317e922951b11890d0eb8df`.
The final Kotlin journey in the full device run also **passed**. Its compiler
scope tables showed `seed` at bytecode offset 0 (length 50), `known` at offset 5
(length 45), and `answer` at offset 9 (length 41). These are class-file offsets,
not claimed DEX addresses. The runtime stops independently established the named
values above. Generated APK SHA-256:
`ea1ec8021f39ace2bbf5d7fb3aa18054eebd39395d4703dd77325d1e75d76804`.
Signing is ephemeral, so subsequent APK hashes can differ. The final run uses the
same source and server fingerprints. Log: `/tmp/mobile-debug-83-device.log`.

The before/after comparison shows usable named Kotlin values and intentional
scope absence on this path. No worker defect was reproduced; no runtime fix was
made. This does not prove the cause of every earlier empty-table observation.
The existing Java `NoLocals` fixture separately omits variable metadata and must
retain `availability: unknown` / `EMPTY_OR_UNAVAILABLE_VARIABLE_METADATA` on ART.
An empty table alone cannot distinguish a genuinely empty scope from unavailable
metadata. Compiler tables plus successful later value reads supply the stronger
evidence for this Kotlin case.

The first compiler attempt used cached Kotlin 2.0.21 with JDK 25, which failed
before device installation because that compiler could not parse the JDK version.
Using installed JDK 17 resolved it. Another initial assertion used case-sensitive
button text; matching native button text case-insensitively follows the existing
fixture convention. Both were test setup issues, not debugger defects. Temporary
output from the failed compilation was removed; the build helper now removes its
temporary directory on any build failure.

## Final checks and limits

`PATH=/private/tmp/mobile-debug-node22/node_modules/node/bin:$PATH npm run verify`
**passed** on Node 22.23.4: lint/quality/architecture, build, all 89 unit files,
and plugin consistency. Log: `/tmp/mobile-debug-83-verify.log`.
An isolated compiler-start failure check also passed: a missing compiler raises
an error and leaves no new temporary fixture directory. Changed relative links,
plugin consistency and `git diff --check` passed.

The full device suite **passed**, all 11 files, using:

```sh
# With the documented compiler/stdlib/JDK variables set:
MCP_KOTLIN_DEVICE=emulator-5554 MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device
```

Coverage: isolated Kotlin scopes and Java debugger/metadata/stepping/cleanup,
Android interactions, Android/iOS observation smoke checks and correlated
evidence, and Android traces. The suite removed its artifacts and left Settings
foreground. iOS observation results do not establish iOS runtime debugging.
Log: `/tmp/mobile-debug-83-device.log`.

Final review retained the attach session ID before asserting success so failed
attach cleanup can be retried in finally. Focused lint passed after this test-only
adjustment. The final focused Kotlin run **passed** on the same server/source,
compiler and emulator, with identical scope-table ranges and all observations.
Log: `/tmp/mobile-debug-83-final-kotlin.log`; final generated APK SHA-256:
`98b5401e1957bc1a8e61d7beec5ead63ece586d6c173db75d79af28cde7575aa`.
Owned forwards, fixture package and temporary output were removed. No unrelated
forward or user-app data was changed. Changes remain local, uncommitted and
unpushed; the issue/board status has not been changed.

Hosted CI additionally compiles the worker with JDK 17 and checks package
contents; those hosted checks were not run. The Kotlin journey is explicitly
opt-in and existing hosted workflows do not provision its compiler. This run
uses cached local compiler dependencies through a temporary CLI wrapper and the
matching stdlib; no compiler/cache artifacts are committed. Reproduction with a
standard Kotlin CLI installation is documented in the fixture README.

Physical-device debugging, other Kotlin/compiler versions,
coroutines, inline/suspend functions, optimization/obfuscation and hosted CI are
unrun. iOS runtime debugging remains unsupported. Only fixed synthetic fixture
values are included; no private app values are used or published.
