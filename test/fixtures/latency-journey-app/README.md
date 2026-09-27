# Interaction latency fixture

An offline native Android fixture, version 1.0. It requires Android SDK platform 36,
build-tools 36.0.0 and JDK 21. The harness builds and signs it using those installed
tools; no Gradle dependency download is needed.

Selectors are accessibility IDs: `saved-session`, `idle-detail`, `activate`,
`active-detail`, `home`, `home-screen`, `deactivate`, `stop`, and `stopped`.
The app keeps control state only in memory. Clearing data and relaunching restores
Home with an inactive control. The static screen makes no network requests.

The performance harness at `test/device/automated/ui-tree-performance/benchmark.ts` can launch the deterministic network screen with
`networkBaseUrl` and `networkRunId` intent extras. That screen exposes `loading`,
`ready`, and `value` accessibility IDs and makes one request to the local harness
server; no public service is contacted.

Capture the instrumented baseline from a clean, built baseline checkout:

```sh
UI_TREE_BASELINE_ROOT=/path/to/instrumented-baseline \
LATENCY_DEVICE_ID=emulator-5554 \
npx tsx test/device/automated/ui-tree-performance/benchmark.ts --baseline-only
```

After implementing a candidate optimization, run the paired comparison from a
clean, built candidate checkout by also setting `UI_TREE_CANDIDATE_ROOT` and
omitting `--baseline-only`. Each run has three warm-ups and ten measured
attempts for the static journey and each controlled response delay.
