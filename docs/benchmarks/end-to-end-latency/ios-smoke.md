# iOS standalone observation smoke (not performance evidence)

Status: stopped; outcome: fail. Stable screen: Settings root on an isolated simulator. No fixture journey or physical iOS claim.

| Case | Successful/measured | p50 ms | p95 ms | Failures | Warm-up failures |
| --- | ---: | ---: | ---: | ---: | ---: |


See ios-smoke.json for environment/build identity, all attempts, phase timings and inclusive timing diagnostics. Ten samples give a preliminary tail estimate. Failed attempts stay visible and fail the run. Probe comparisons include device variability; nested intervals cannot be summed. Application work remains in round trips. The shared #89 fixture remains required for equivalent static/network journeys.
