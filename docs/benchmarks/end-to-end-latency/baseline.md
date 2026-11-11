# End-to-end latency baseline

Status: stopped. Build: 3e70e4207b228d002450f4d99f2ad2511d9df0b33c936aec4eeaf271603c34c6.

| Case | Successful/measured | p50 ms | p95 ms | Failures | Warm-up failures |
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

See baseline.json for exact source/build hashes, environment, phase durations, attempt order, inclusive components and failure records. Ten attempts provide a preliminary tail estimate. Failed attempts are excluded from percentiles, retained in raw data, and fail the run.

Intervals can overlap; component sums are not an additive latency budget. Client-minus-handler includes scheduling, transport and uninstrumented work. Handler residual excludes the union of recorded spans. Tree acquisition/parse/retry events are separate nested diagnostics. Application work inside requests remains included. Startup, fixture builds/resets and external validation are excluded from steady-state round trips. SDK wire serialization is not isolated.
