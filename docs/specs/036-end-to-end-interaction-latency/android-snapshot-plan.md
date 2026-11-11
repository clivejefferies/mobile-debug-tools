# Android debug snapshot verification plan

The user accepted the [amendment](android-snapshot-amendment.md) on 2026-11-10.

1. Build and freeze the current baseline before editing production source.
2. Share the Android fingerprint calculation with snapshot collection. Use the
   existing tree handler and retain the Android activity lookups and iOS branch.
3. Extend snapshot tests to cover hashing, ordering, target resolution, fresh
   requests, partial errors, timeouts, and iOS dispatch. Keep native subprocess
   ownership with the existing acquisition path.
4. Run `node --import tsx test/unit/observe/capture_debug_snapshot.test.ts`,
   `npm run verify`, and `npm run test:device` on the candidate.
5. Use Node 22 or newer and the existing Android API 36 fixture tooling for
   paired measurement. Run `node --import tsx test/device/automated/latency/snapshot-pair.ts`
   with `LATENCY_DEVICE_ID`, `SNAPSHOT_BASELINE_SERVER`, and
   `SNAPSHOT_BASELINE_SOURCE_SHA` set. Use the same dedicated fixture screen and
   flags for both builds. Count acquisitions and physical attempts, assert the
   candidate fingerprint and tree, record p50/p95 and failures, and close owned
   server groups. Restore fixture state and stop any emulator started for testing.

## Verification results

- The focused snapshot unit test and `npm run verify` passed locally on Node
  23.11.0. Hosted CI was not run.
- The [paired Android benchmark](../../benchmarks/end-to-end-latency/android-snapshot-pair.md)
  passed with ten measured snapshots per build. Median latency fell from
  3.805 s to 2.364 s, and p95 fell from 3.949 s to 2.423 s. The candidate
  performed one tree acquisition per call and returned fresh evidence after
  navigation. Both server groups exited and the fixture was cleaned up.
- Android compact results and correlated evidence passed. The full device suite
  and the separate correlated evidence smoke both stopped at the iOS simulator
  prerequisite. Environment-gated debugger fixtures were skipped.
