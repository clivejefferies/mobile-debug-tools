# UI tree observation performance

Fixture SHA-256: be322549a4ba154c0b1c85876559157bb21a911673906d270a7ec26dc2fcfa89. Android 16, API 36. Three warm-ups and ten measured attempts per flow and mode. Failed attempts are visible in the JSON reports and excluded from percentiles.

| Mode | Flow | p50 ms | p95 ms | Failures |
|---|---|---:|---:|---:|
| baseline | static | 52402.254875 | 52973.044208 | 0 |
| baseline | network_100ms | 5607.070875 | 5851.747375 | 0 |
| baseline | network_1500ms | 6996.555542 | 7165.898416 | 0 |
| candidate | static | 43823.508666 | 44747.601625 | 0 |
| candidate | network_100ms | 4761.979625 | 4967.290833 | 0 |
| candidate | network_1500ms | 6176.188083 | 6469.3265 | 0 |

| Acceptance gate | Result |
|---|---|
| static_p50_improvement | pass |
| static_p95_regression | pass |
| network_100ms_p95_regression | pass |
| network_1500ms_p95_regression | pass |
| zero_measured_failures | pass |

Raw per-attempt records include acquisition and consumer events, response-send timestamps, and assertion-read timestamps. Device serials and UI contents are not recorded.

The candidate improves static p50 by 16.4% (52.40 s to 43.82 s). Both modes
made 200 physical tree reads across their ten measured static attempts. The
baseline recorded 200 approximately 400 ms first-attempt waits; the candidate
recorded none. Separate assertion samples and same-step target consumers remain
visible in the acquisition records. The candidate also lowers network p95 at
both response delays. The fixture recorded no `VERIFICATION_UNAVAILABLE` in
either mode, so this result does not establish its rate in other apps.

`initial-baseline.json` preserves the standalone instrumentation-only capture
made before the acquisition change. The paired `baseline.json`,
`candidate.json`, and `comparison.json` use one APK SHA-256 and the same
emulator settings. An earlier paired attempt is retained as
`comparison-attempt-1.json`: one measured baseline 100 ms network read failed
after a 181.97 s physical acquisition, and one candidate 1,500 ms warm-up
failed before an observation event. That attempt failed the zero-failure gate.
The unchanged repeat above had no failures. The cause of the first attempt's
stalls was not established, so the repeat supports the latency result but does
not prove the stall cannot recur. iOS latency was not measured.
