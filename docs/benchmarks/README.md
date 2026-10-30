# Benchmarks

[Documentation](../README.md)

Use these guides to run a benchmark or inspect its recorded results. Each
benchmark has one directory containing its instructions, report, and supporting
data. Generated filenames are retained so the harness can update them directly.

These reports describe particular builds and devices. Passing a smoke check does
not establish a performance improvement, and Android timings do not establish
iOS latency.

| Benchmark | Protocol | Recorded results | Design |
| --- | --- | --- | --- |
| Interaction latency | [Run the benchmark](interaction-latency/README.md) | [Android measurements](interaction-latency/final.md), [iOS interaction validation](interaction-latency/ios-validation.md) | [018](../specs/018-interaction-latency-and-batched-journeys/spec.md) |
| UI-tree observation | [Run the paired benchmark](ui-tree-performance/README.md) | [Comparison and limitations](ui-tree-performance/comparison.md) | [019](../specs/019-ui-tree-observation-performance/spec.md) |

Fixture instructions: [latency journey app](../../test/fixtures/latency-journey-app/README.md).
