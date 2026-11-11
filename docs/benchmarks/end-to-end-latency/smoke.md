# End-to-end latency smoke (not performance evidence)

Status: finished. Build: 8f3a9bc8f498181686362c829e7395f301e85681d8ea1667692e2b33c18d011c.

| Case | Successful/measured | p50 ms | p95 ms | Failures | Warm-up failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| standalone | 1/1 | 146335.1 | 146335.1 | 0 | 0 |
| full-debug | 1/1 | 84684.9 | 84684.9 | 0 | 0 |
| full-compact | 1/1 | 85400.3 | 85400.3 | 0 | 0 |
| light-debug | 1/1 | 65161.8 | 65161.8 | 0 | 0 |
| light-compact | 1/1 | 50780.4 | 50780.4 | 0 | 0 |
| screenshot-on | 1/1 | 884.2 | 884.2 | 0 | 0 |
| screenshot-off | 1/1 | 658.8 | 658.8 | 0 | 0 |
| tree-on | 1/1 | 2611.1 | 2611.1 | 0 | 0 |
| tree-off | 1/1 | 2509.6 | 2509.6 | 0 | 0 |
| snapshot-on | 1/1 | 4575.6 | 4575.6 | 0 | 0 |
| snapshot-off | 1/1 | 4667.2 | 4667.2 | 0 | 0 |

See smoke.json for exact source/build hashes, environment, phase durations, attempt order, inclusive components and failure records. Ten attempts provide a preliminary tail estimate. Failed attempts are excluded from percentiles, retained in raw data, and fail the run.

Intervals can overlap; component sums are not an additive latency budget. Client-minus-handler includes scheduling, transport and uninstrumented work. Handler residual excludes the union of recorded spans. Tree acquisition/parse/retry events are separate nested diagnostics. Application work inside requests remains included. Startup, fixture builds/resets and external validation are excluded from steady-state round trips. SDK wire serialization is not isolated.
