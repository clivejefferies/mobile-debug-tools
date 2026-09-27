# Interaction latency benchmark

Run after `npm run verify`:

```sh
MCP_ADB_TIMEOUT=30000 LATENCY_DEVICE_ID=emulator-5554 npx tsx test/device/automated/latency/benchmark.ts
```

Use the named Pixel 9 Pro Android 16 emulator with SDK platform 36, build-tools
36.0.0, and a Java installation capable of `javac --release 8`. Set its display
to 720x1600 at density 240 to keep repeated UI hierarchy reads responsive; the
report records the image, API, display size, density, and Android command timeout.
The harness builds and signs its own offline fixture. It resets that fixture
only; no other app data is cleared.

The sequential protocol compares the legacy handle-based public tool flow with
full/debug and light/compact journeys through a spawned stdio MCP server. Each
mode has three warm-ups and ten measured runs. Screenshot and screenshot-free
debug snapshot calls are measured separately. JSON and Markdown reports record
fixture hash, environment, request sequence, failures, and percentiles. Failed
runs do not enter percentiles. Raw observations and device serials are not saved.
See [iOS simulator validation](ios-validation.md) for the interaction checks.

The process exits unsuccessfully on >10% full p95 regression or <30% light p50
improvement. A failed run is reported and excluded from percentiles as the spec
requires; inspect its selector and tool or step before accepting the result.
