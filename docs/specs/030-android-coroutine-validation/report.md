# Android coroutine debugger assessment — issue #93

Date: 2026-11-02. Source: [issue #93](https://github.com/clivejefferies/mobile-debug-tools/issues/93).
Scope: [accepted specification](spec.md); [fixture/reproduction](../../../test/fixtures/coroutine-app/README.md).

## Method and evidence boundaries

The fixture uses explicit CompletableDeferred gates, two named single-thread
executor dispatchers, a nested async child and a cancellation/finally path.
It uses no debug probes or app instrumentation. The runner uses the existing
MCP stdio server and records source/APK/server/worker/dependency fingerprints,
compiler line/local tables and actual stops, stacks and locals. Fresh UI-tree
assertions independently establish completion and cancellation recovery.
Opaque MCP thread IDs are scoped to each stop; different ID strings alone do
not establish a dispatcher change. Live synthetic thread-name locals and fixture
checks establish the named dispatcher execution instead.

Environment selected: emulator-5554, Android 16/API 36; Node 22.23.4;
Kotlin compiler/stdlib 2.0.21; kotlinx-coroutines-core-jvm 1.9.0;
fixture compiler JDK 17.0.11; Android SDK/build-tools 36. The debugger's existing
Java discovery selects Android Studio JBR, which reports 25.0.3 on this host;
setting fixture JAVA_HOME does not override that debugger discovery order.
The local run used a temporary wrapper around the cached Kotlin embeddable
compiler; the fixture README documents a standard Kotlin CLI installation.
No result is inferred for other compiler/runtime versions.

## Results

Focused emulator journey: **PASS**. Full local output:
`/tmp/mobile-debug-93-emulator.log`; compact checked-in [evidence](evidence.json).

| Check | Observed result |
| --- | --- |
| Before/after gate suspension | PASS: source stops; `known=42` readable on both sides |
| Dispatcher change | PASS: live locals `fixture-first` then `fixture-second` |
| Nested child work | PASS: helper argument `43`; final `answer=44` |
| Into/over/out | PASS inside the synchronous helper/increment calls |
| Suspension-boundary step | Observed stop at `completeWork` entry, line 50; no logical-coroutine-following claim |
| Safety and recovery | PASS: pause guard, stale-frame rejection, cancelled event wait with usable session |
| Job cancellation | PASS: child finally source stop, joined cancellation, fresh `Coroutine cancelled` UI |
| Completion/recovery | PASS: fresh `Coroutine result 44` UI after detach |
| Owned cleanup | PASS: complete detach, forwards preserved, package/build directory removed |
| Physical-device journey | UNRUN; explicit serial selection is required |

Source SHA-256: `5978b835673876642c256b1c688975e78018addc1f68219371bc47c8cc29a92b`.
Built server/dist SHA-256: `4f7bf452fc0022c8feb492f11a25c34ac5e360baff9f77d752dd0d248105d581`.
Worker source SHA-256: `fb15e7add65fb3682d86153818d02378084a46fcd49b2c23c0eafdba290f8323`.
Compiler/APK/dependency metadata and hashes are in the evidence file. APK signing
is ephemeral, so subsequent APK hashes can differ.

Initial cancellation recovery failed to reach its expected UI state while
retaining the prior completion text. The test now starts cancellation from a
fresh fixture process after detaching the boundary-step assessment. This is
fixture-owned lifecycle isolation, not a debugger cleanup operation.
An initial thread-name assertion also exposed compiler elimination of unused
locals; the fixture now uses those values after the breakpoint so their emitted
scope covers inspection. Assertions were not weakened to treat absent values
as a dispatcher proof.

## Interpretation and follow-up recommendation

Existing source breakpoints can be a useful way to inspect separately executing
parts of a coroutine. Source bindings must include generated binary class names
from the actual compiler output. A shallow locals result and current-thread stack
are execution evidence; they do not enumerate suspended coroutines, establish a
parent/child job identity or recover an asynchronous logical stack. A local spilled
into a continuation field need not appear in the current frame's local table.

**No-go for implementing generic coroutine reconstruction in this ticket.** A
separate feasibility design should first prove Android-compatible discovery of
active and suspended continuations, stable job identity and ownership/parent-child
relationships, and a versioned mapping from DebugMetadata/state labels to logical
source frames. This would require inspection beyond the existing shallow locals
API, or explicitly agreed app instrumentation, with privacy and compatibility
limits. No such mechanism has been validated here.

The upstream [kotlinx-coroutines-debug documentation](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-debug/)
describes JVM agent-based coroutine tracking and explicitly identifies Android
instrumentation limitations. It is not evidence that installing that JVM agent
would supply an Android solution. The [DebugProbes API](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-debug/kotlinx.coroutines.debug/-debug-probes/)
describes tracking creation, suspension and resumption with instrumentation and
overhead; this fixture does not enable it. Android-specific alternatives and
metadata compatibility remain design questions. Defer that capability design
until after the bounded assessment and iOS parity, as the issue requires.

## Limits

Physical-device verification, other Kotlin/coroutine versions, optimized or
obfuscated apps, inline suspend functions, process/device disconnect and forced
host termination are unrun unless separately recorded below. Signal handling
requests MCP cancellation then finally attempts owned cleanup; SIGKILL/host loss
cannot run finally. No iOS runtime-debugger support is claimed. Hosted CI has not
run; it separately compiles the worker with JDK 17 and checks package contents,
and its ordinary device workflow does not provision this opt-in Kotlin compiler.
Local build/test evidence is not an installed or published-package check.

## Repository verification

`npm run verify` **PASS** on Node 22.23.4: lint, structural/architecture checks,
TypeScript build, all 89 unit files and plugin consistency. Final log:
`/tmp/mobile-debug-93-final-verify.log`. The sandbox blocked tsx IPC creation;
verification passed in the authorized run outside the sandbox without changing
checks. Changed relative links, new-file whitespace and `git diff --check` passed.

The focused review found no required production-code or schema change. Fixture
subprocesses/polls are bounded; package targeting is explicit; the runner refuses
pre-existing fixture installations and keeps normal debugger cleanup separate
from resetting its own app between independent cases. At the original verification,
changes were local, uncommitted and unpushed.

Full `npm run test:device` **PASS**, all 12 files, with
`MCP_COROUTINE_DEVICE=emulator-5554 MCP_KOTLIN_DEVICE=emulator-5554 MCP_DEBUGGER_DEVICE=emulator-5554`
and the documented local compiler/stdlib/coroutine paths set. Log:
`/tmp/mobile-debug-93-device.log`. The coroutine assessment passed again on the
same source/server/worker fingerprints (ephemeral APK signing produced SHA-256
`6cc95ae8ad9d254444e9704a7526d62a0ab1c8354a5624d6695789eedd429f82`).
Existing Kotlin/Java debugger, interaction, Android/iOS observation smoke,
correlated-evidence and Android system-trace checks passed. These iOS checks do
not verify iOS runtime debugging. The new fixture's package, temporary outputs
and owned forwards were removed; no physical-device coroutine check ran.

## PR #96 repair evidence

The original results above predate the readiness-race fix: they establish the
recorded locations/values, but the original UI readiness alone did not prove
that the gate wait had suspended before release/cancellation. New readiness
runs as queued work behind the coroutine on its own single-thread executor,
which cannot execute until that coroutine yields. The repaired dispatcher
breakpoint class is `MainActivity$completeWork$3`.

Overall JSON PASS now follows cleanup, and cleanup failures are reported as FAIL.
Forward comparisons select only the target serial and sort entries. The new
unit regressions and repository verification passed (90 unit files, Node 22.23.3;
`/tmp/pr96-verify.log`). The first attempt on a restored emulator
snapshot hit install/uninstall timeouts; that real cleanup failure emitted JSON FAIL
without an overall PASS (`/tmp/pr96-device.log`). The task-owned leftover package
was removed after a cold start. Final device-rerun evidence is recorded below;
the original suspension-readiness evidence is superseded.

Final repair verification: `npm run verify` **PASS**, all 90 unit files, Node
22.23.3 (`/tmp/pr96-final-verify.log`). Unit checks cover successful cleanup before
PASS, work failure, cleanup failure, simultaneous failures without losing either
error, exact serial filtering, other-device churn and order normalization.

Full device-suite attempts **FAIL** during installation/cleanup on the restored
and cold-started emulator (`/tmp/pr96-device.log`, `/tmp/pr96-device-cold.log`).
Incremental installation continued after host-side timeout, leaving a differently
signed package; the task-owned package was removed. A focused streamed-install
run used an external temporary ADB_PATH wrapper adding `--no-incremental` only
for install, without changing repository timeouts or assertions.

That focused run **passed** completion, verified the queued readiness and updated
`completeWork$3` breakpoints, named dispatchers, known values, synchronous steps,
stale/pause guards, cancelled wait recovery and the bounded suspension-step
observation. It then **failed** at `am start -W` restarting the fixture before
cancellation, followed by an uninstall timeout. Its overall JSON FAIL preserves
both errors (`/tmp/pr96-focused-streamed.log`). Repaired cancellation readiness
is compiler-checked but its device journey is **UNRUN**; remaining suite checks
were not reached. No full native pass is claimed for this repair.

Current fixture source SHA-256:
`d4656e3736cc245230bc000c6574288b145df47957dd7ee511ea98717afde4df`.
Final independent package query returned no owned fixture package; no ADB forwards
remained and temporary build output was removed. The review fixes introduce no
production server behaviour or contract change. Physical-device checks and hosted
CI are unrun for this revision.
