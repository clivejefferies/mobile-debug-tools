# End-to-end interaction latency

[Benchmark index](../README.md) · [Specification](../../specs/036-end-to-end-interaction-latency/spec.md)

This investigation reuses the Spec 018 Android fixture and Spec 019 tree metrics.
It does not replace their historical results or optimization acceptance gates.
Requires Node >=22, Java supporting `--release 8`, Android platform 36 and
build-tools 36.0.0. Start an Android emulator, then run from the repository root:

```sh
npm run verify
LATENCY_DEVICE_ID=emulator-5554 MCP_ADB_TIMEOUT=30000 npx tsx test/device/automated/latency/end-to-end.ts --smoke
LATENCY_DEVICE_ID=emulator-5554 MCP_ADB_TIMEOUT=30000 npx tsx test/device/automated/latency/end-to-end.ts
```

Only explicitly named Android emulators are accepted; physical phones are not
selected. Existing device resolution can enumerate other attached devices;
the report records discovery counts without serials. No display configuration is changed. The dedicated fixture is built,
installed, and reset; an installation created by this run is removed on exit.
A pre-existing fixture installation is left installed, with reset fixture data.
The harness owns isolated POSIX server process groups, closes them on exit and
interrupt, and verifies their termination. An unsafe timeout stops the run;
semantic failures are retained before the next explicitly recorded reset.

The smoke uses one attempt per case and writes `smoke.json`/`smoke.md`; it is not
performance evidence. The full run writes `baseline.json`/`baseline.md` after
each attempt, preserving partial results on failure/interruption. It performs
three warm-ups and ten measured attempts per case, reversing mode order every
round. Do not run other device workloads concurrently.

`baseline-attempt-1.json`/`.md` retain the first failed warm-up run: the emulator
disappeared, the next reset failed, and fixture cleanup could not be confirmed.
No measured samples were produced. Both owned server groups exited. The retry
restores the same AVD headlessly using `emulator -avd Pixel_9_Pro -port 5554
-no-window -no-snapshot-save`; it does not wipe data. This startup configuration
is distinct from the earlier development smoke and failed attempt.

Cases compare the original standalone handle flow and four full/light ×
debug/compact journeys, retaining all six destination assertions. Screenshot,
UI tree and screenshot/log-free snapshot calls are separate cases on the known
fixture home screen, with instrumentation on and off. Light/compact has existing
assertion-based observation sharing; mode differences can therefore include
acquisition counts as well as response construction costs. They are not a pure
serialization microbenchmark.

Raw reports include source/build/harness/fixture hashes, dirty paths, environment,
request order, byte counts, timing-only events, setup/startup durations and
cleanup. Device serials, raw responses and unrestricted stderr are not retained.
Source/build/harness changes during measurement invalidate the run. Externally
run builds and validation suites are separate from MCP request time. This fixture
uses offline SDK tools rather than Gradle. Device application work inside requests
is included; it is not established as pure MCP overhead.

Percentiles use nearest rank and successful attempts only; failures remain in
raw records and fail the run. Warm-up failures are counted separately. Ten samples
provide a preliminary p95, not a robust tail estimate. Inclusive component spans
overlap and must not be summed. Handler residual subtracts their interval union;
client-minus-handler includes scheduling, transport and uninstrumented work.
Existing serialization spans cover selected response construction, not all SDK
wire serialization. Tree event stages expose acquisition, retry and parse costs.
Subprocess spans cover `execCmd`; direct platform spawns can remain in residuals.

Compare observation `on`/`off` results to assess probe overhead; these include
normal device variability and are not automatically a causal overhead estimate.
`missing_request_metrics` is expected for `off` cases only. Instrumentation uses
`MOBILE_DEBUG_MCP_LATENCY_METRICS=1` and the existing
`MOBILE_DEBUG_MCP_UI_TREE_METRICS=1` only in instrumented benchmark servers.
Normal MCP contracts and diagnostic output are unchanged.

For standalone iOS observations, use an isolated booted simulator with working
idb discovery and English Settings. The runner confirms the Settings root
before each timed request and records preparation time separately.

```sh
IOS_LATENCY_DEVICE_ID=YOUR_SIMULATOR_ID npx tsx test/device/automated/latency-ios/benchmark.ts --smoke
IOS_LATENCY_DEVICE_ID=YOUR_SIMULATOR_ID npx tsx test/device/automated/latency-ios/benchmark.ts
```

Equivalent iOS fixture journeys depend on [#89](https://github.com/clivejefferies/mobile-debug-tools/issues/89).
See the [investigation report](investigation.md) for the Android measurements
and the observed iOS setup blocker.

For a focused [Android snapshot comparison](android-snapshot-pair.md), build
the pre-change checkout and preserve its emitted `dist` directory and source
hash. The preserved build needs its ESM `package.json` and the same installed
dependencies. Build the candidate in the current checkout, then run:

```sh
LATENCY_DEVICE_ID=emulator-5554 \
SNAPSHOT_BASELINE_SERVER=/absolute/path/to/baseline/dist/server.js \
SNAPSHOT_BASELINE_SOURCE_SHA=BASELINE_SOURCE_SHA256 \
MCP_ADB_TIMEOUT=30000 \
node --import tsx test/device/automated/latency/snapshot-pair.ts
```

Use the `treeHash` helper in `end-to-end-environment.ts` to hash baseline `src`
before editing it. This command writes `android-snapshot-pair.json` with the
attempts and acceptance result.
