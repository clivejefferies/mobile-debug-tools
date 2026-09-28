# UI tree observation performance benchmark

This paired Android benchmark compares a clean, built instrumentation baseline
with a clean, built candidate. It runs the Spec 018 static journey and a local
network-backed loading-to-ready flow against the same fixture APK and emulator.
The network flow asserts a run-unique value from a physical tree read that
started after the local server sent its response.

Capture the instrumented baseline first from a clean, built baseline checkout:

```sh
UI_TREE_BASELINE_ROOT=/path/to/instrumented-baseline \
LATENCY_DEVICE_ID=emulator-5554 \
npx tsx test/device/automated/ui-tree-performance/benchmark.ts --baseline-only
```

This writes `baseline.json`. After measuring and implementing an optimization,
run the paired comparison from the clean, built candidate checkout:

```sh
UI_TREE_BASELINE_ROOT=/path/to/instrumented-baseline \
UI_TREE_CANDIDATE_ROOT=/path/to/optimized-candidate \
LATENCY_DEVICE_ID=emulator-5554 \
npx tsx test/device/automated/ui-tree-performance/benchmark.ts
```

Add `--smoke --baseline-only` for one attempt per flow while checking the
fixture and emulator connection. Smoke mode writes no performance report and
does not satisfy the sample-count or acceptance gates.

Both input checkouts must contain `dist/server.js` and have clean Git working
trees. The harness checks both before installing or resetting the fixture. It
builds one APK from the candidate fixture and uses that exact APK in both modes.
Each flow and mode receives three warm-ups and ten measured attempts; baseline
and candidate order alternates by pair.

The paired run writes `baseline.json`, `candidate.json`, `comparison.json`, and
`comparison.md` here. Timing events are enabled only in the spawned benchmark
servers through `MOBILE_DEBUG_MCP_UI_TREE_METRICS=1`; normal MCP responses do
not gain timing fields. Events contain timings, platform, generated journey step
IDs, and opaque acquisition IDs. They omit UI contents, app identifiers,
screenshots, logs, payloads, and device serials. iOS latency remains unmeasured.

The checked-in `initial-baseline.json` is the standalone capture taken before
the optimization. The checked-in `baseline.json` is the baseline side of the
paired run, so it shares the fixture APK hash with `candidate.json`.
`comparison-attempt-1.json` retains an earlier paired run with two visible
network failures; see `comparison.md` for the outcome and limitation.
The report commit SHAs are available locally as `codex/spec-019-baseline` and
`codex/spec-019-candidate`; create clean, built checkouts of those refs to
reproduce the paired measurement.

For the opt-in Android bridge, run
`LATENCY_DEVICE_ID=emulator-5554 node --import tsx test/device/automated/ui-tree-performance/bridge-probe.ts`.
Its `bridge-probe.json` compares ten bridge and legacy reads, checks a network
update, and checks a timer that changes visually without emitting an
accessibility event. The timer check catches a stale accessibility cache even
when every bridge request calls `getRootInActiveWindow()`.
