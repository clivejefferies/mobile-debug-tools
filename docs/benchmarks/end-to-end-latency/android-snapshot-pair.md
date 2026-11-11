# Android debug snapshot comparison

The focused comparison passed on 2026-11-10. Both builds used the same
Pixel 9 Pro AVD on Android 16/API 36 and the same installed latency fixture.
Display overrides were 720×1600 at density 240. The harness alternated build
order for three warm-ups and ten measured attempts per build. Each timed call
used `capture_debug_snapshot` with screenshots and logs disabled.

| Build | p50 | p95 | Physical read attempts | Failed reads | Failed tool calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 3.805 s | 3.949 s | 40 | 20 | 0 |
| Candidate | 2.364 s | 2.423 s | 10 | 0 | 0 |

Median latency fell 38% and p95 fell 39%. Each measured candidate snapshot
completed one tree acquisition and one physical read. Both builds completed
all warm-ups. The p95 is the maximum of ten successful samples under the
nearest-rank definition. The comparison measures the fixture snapshot with
both optional collectors disabled. It does not quantify other flag combinations
or platform gains.

The candidate returned the selected device's fresh tree and preserved its
revision and timestamp. On the stable fixture screen, the returned fingerprint
matched the existing algorithm applied to that tree and its activity. After a
verified navigation from the home screen to idle detail, a separate snapshot
returned the detail tree, a higher revision, and a different fingerprint.
Both owned server groups exited. The harness stopped the fixture and removed
any install it created.

The [raw report](android-snapshot-pair.json) records source, build, and installed
fixture hashes, tool versions, cleanup, and all measured and warm-up attempts.
