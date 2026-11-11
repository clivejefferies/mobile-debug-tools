# End-to-end latency baseline

Status: stopped. Build: 3e70e4207b228d002450f4d99f2ad2511d9df0b33c936aec4eeaf271603c34c6.

| Case | Successful/measured | p50 ms | p95 ms | Failures | Warm-up failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| standalone | 0/0 | n/a | n/a | 0 | 0 |
| full-debug | 0/0 | n/a | n/a | 0 | 0 |
| full-compact | 0/0 | n/a | n/a | 0 | 1 |
| light-debug | 0/0 | n/a | n/a | 0 | 1 |

See baseline-attempt-1.json for exact source/build hashes, environment, phase durations, attempt order, inclusive components and failure records. Percentiles use the successful measured count shown for each case. With 1–19 successful samples, nearest-rank p95 is the sample maximum. Zero successful samples yield no percentiles. Failed attempts are excluded from percentiles, retained in raw data, and fail the run.

Intervals can overlap; component sums are not an additive latency budget. Client-minus-handler includes scheduling, transport and uninstrumented work. Handler residual excludes the union of recorded spans. Tree acquisition/parse/retry events are separate nested diagnostics. Application work inside requests remains included. Startup, fixture builds/resets and external validation are excluded from steady-state round trips. SDK wire serialization is not isolated.
