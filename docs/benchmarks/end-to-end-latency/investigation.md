# Investigation findings — ticket #100

The follow-up [paired snapshot comparison](android-snapshot-pair.md) measures
the implemented Android tree reuse on a separate, complete focused run.
The sections below describe the original broad investigation.

## Status and evidence boundary

The measurement harness is implemented; Android performance acceptance remains
**partial / failed**, not a completed ten-attempt baseline. The final Android
run stopped when the owned emulator became unresponsive and exited with code
139. Its log recorded graphics-buffer errors and QEMU main/CPU-thread hangs.
The cause of the emulator exit has not been established. No runtime optimization
or speedup claim is made.

The run completed nine successful measured attempts per case. The tenth
standalone attempt timed out; the following full/debug attempt failed during
reset, leaving nine attempts unrun. Three earlier warm-up journey failures are
also retained. Both owned MCP server groups exited; fixture force-stop could not
be confirmed after the emulator disappeared. There is no running owned Android
emulator left to clean up. Source/build/harness hashes were unchanged during the
run. See [raw baseline](baseline.json), [generated summary](baseline.md), and
[failed first warm-up run](baseline-attempt-1.json).

The first run also lost its emulator and produced no measured samples. It is
kept separately. The second run cold-booted the same Pixel_9_Pro AVD with
`-port 5554 -no-window -no-snapshot-save`; display 720x1600 and density 240 were
already configured and were not changed by the harness. Android 16/API 36,
emulator/adb/Java/Node versions and all identity hashes are in the raw report.
The original development smoke is separate and is not performance evidence.

## Provisional Android round trips

Times are milliseconds. Standalone flow time is the sum of 19 complete SDK
request/response intervals; client orchestration and metric-drain gaps are
outside that sum. A journey is one complete SDK call. Failed attempts are omitted
from percentiles and retained in the attempt/failure records. With nine successful
samples, nearest-rank p95 is the largest successful observation; it is a
preliminary tail estimate. The missing tenth samples must not be silently filled.

| Case | Successful/measured attempts | p50 ms | p95 ms | Measured failures | Warm-up failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| standalone | 9/10 | 128948.9 | 134774.9 | 1 | 0 |
| full-debug | 9/10 | 76711.6 | 82366.9 | 1 | 0 |
| full-compact | 9/9 | 74612.0 | 172254.9 | 0 | 1 |
| light-debug | 9/9 | 58121.4 | 59386.7 | 0 | 1 |
| light-compact | 9/9 | 45517.9 | 46738.0 | 0 | 1 |
| screenshot-on | 9/9 | 552.2 | 993.9 | 0 | 0 |
| screenshot-off | 9/9 | 598.4 | 944.2 | 0 | 0 |
| tree-on | 9/9 | 2647.6 | 3044.8 | 0 | 0 |
| tree-off | 9/9 | 2629.9 | 3869.1 | 0 | 0 |
| snapshot-on | 9/9 | 4185.3 | 4538.8 | 0 | 0 |
| snapshot-off | 9/9 | 4067.6 | 4594.6 | 0 | 0 |

## Measured costs and negative findings

- Successful standalone/full-debug/full-compact/light-debug/light-compact flows
  use 44/32/32/25/19 physical tree reads respectively. Physical acquisition is
  around two seconds per successful read; XML parsing is below a millisecond.
  Metadata and display queries are separate recorded costs. These statements
  describe this emulator and workload, not all devices or applications.
- Full compact output is much smaller than debug output while physical-read
  counts are equal. Client-minus-handler time is only milliseconds in these
  successful samples; it includes transport, scheduling and uninstrumented work.
  Together with the recorded construction spans, this does not justify treating
  serialization or transport as the primary bottleneck.
- Light/compact already shares a tap's post-observation with the following
  assertion. Its six fewer reads than light/debug are existing behavior, not an
  optimization implemented by this ticket. Every comparison retains all six
  destination assertions.
- Screenshot-free/log-free snapshots execute two tree acquisitions. In the nine
  successful measured snapshot calls, 36 physical reads include 18 failed reads
  followed by recovery. A successful tool outcome therefore does not imply every
  underlying acquisition attempt succeeded. All timing/retry events are retained.
  [Snapshot collection](../../../src/observe/snapshot-collection.ts) starts
  fingerprint and tree work concurrently, and the
  [Android fingerprint path](../../../src/observe/android/fingerprint.ts) obtains
  its own tree. This supports a focused future investigation of one declared
  observation transaction shared by those consumers. It does not establish the
  gain or correctness of an unimplemented candidate.
- Instrumented/uninstrumented observation pairs quantify combined probe and
  device/order variability. Signed paired differences are in the JSON. They are
  not an isolated causal overhead estimate, and may be negative.

Inclusive component spans overlap; never sum them into an additive budget.
Handler residual subtracts their interval union, but assertion/verification spans
include their nested acquisition work. Component summaries total recorded spans
per request; zero means no span of that stage was recorded, not proof that all
possible work in that category cost zero. SDK wire serialization is not separately
profiled. Device-side application work remains inside request durations.

Fixture build/install, reset/readiness preparation and server connection are
separate phases. The fixture uses offline SDK tools rather than Gradle. External
unit/device-suite execution is outside MCP request percentiles; its total duration
was not separately benchmarked. Early warm-ups overlapped local unit validation;
measured attempts began after that validation completed.

## Reliability and next steps

Warm-up failures were light/debug assertion `assert-3` (`ASSERTION_TIMEOUT`),
full/compact `tap-2` (`ELEMENT_NOT_FOUND`), and light/compact `tap-2`
(`ACTION_TIMEOUT`). Metrics alone do not establish their root cause. Graphics
errors were observed, but causality is unproven. They must not be labelled
pre-existing code failures or instrumentation regressions without a controlled
reproduction.

Obtain a stable emulator and rerun the unchanged protocol to finish the required
sample count before accepting an optimization comparison. Investigate the
snapshot acquisition/retry bottleneck in an accepted specification amendment;
retain freshness, device scope, stabilization, deadlines and cleanup. Do not
introduce cross-request caching or reduce assertions. No candidate comparison has
run, so there is no evidence of an optimization gain.

## iOS

Standalone observation measurement was blocked on an isolated iPhone 17 Pro
running iOS 27.2 (24B8117). The local server's Settings readiness assertion
timed out after about 32.6 seconds and produced zero measured samples. A
subsequent screenshot showed a blank Settings content area. The accessibility
call reported its idb prerequisite unavailable, and `idb list-targets --json`
failed even though the repository resolver found fb-idb 1.1.7 through its
fallback. The direct companion listing later succeeded, so the cause of the
CLI capability failure remains unresolved. Both owned MCP servers exited and
the temporary simulator was removed. See the [smoke record](ios-smoke.json)
and [verification evidence](../../specs/036-end-to-end-interaction-latency/verification.md).

The shared static/network fixture belongs to #89. Equivalent iOS journeys
remain blocked pending that fixture and a working observation path.
