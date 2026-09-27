# Specification 019 — UI-Tree Observation Performance

## Status

Implemented for Android with a paired emulator benchmark. iOS correctness has
unit and simulator smoke coverage; iOS latency remains unmeasured. See
`docs/benchmarks/ui-tree-performance/` for the initial baseline, paired reports,
and the retained failed first comparison attempt.

## 1. Summary

Reduce the elapsed time spent obtaining accessibility trees during interaction journeys while preserving fresh-state verification. Measure physical hierarchy reads and their cost first. Then remove demonstrably redundant work within a single observation or journey, and shorten platform acquisition where it can be done without returning an older tree as new evidence.

No public tool, request field, default verification mode, or response shape changes in this specification.

## 2. Current state and problem

Specification 018's checked-in Android benchmark reports a 51.8-second p50 `light`/`compact` journey on a Pixel 9 Pro Android 16 emulator. That is faster than its full/debug comparison, but still slow for an agent completing a short flow. The 018 report does not attribute the compact journey's time to individual hierarchy reads, so it does not establish how much of the remaining 51.8 seconds this work can save.

The present Android `getUITree` path obtains device metadata and display resolution, waits before an attempt, invokes `uiautomator dump`, reads the dumped XML, and parses it. The iOS path obtains device metadata, checks `idb`, waits, invokes `idb ui describe-all --json`, and parses the result. Both may retry. `wait_for_ui` and journey assertions can take multiple observations by design.

Specification 018 already passes the selector-resolution tree into `tapElementHandler` and, for a compact light tap immediately followed by an element-visible assertion, uses that assertion as the post-action observation. Spec 019 must retain those savings. It must not count a pre-action selector tree as proof of a post-action state, or collapse independent samples required by stabilization.

The roadmap's wait/synchronization work requires explicit freshness and reliable in-place UI updates. A network-backed screen can change without any MCP action. A time-based cross-request tree cache would therefore risk false assertions even if it improves a static fixture benchmark.

An agent report describes faster app start, tap dispatch, and screenshots, while reporting that `find_element` remains the slowest operation and that `verificationMode: "light"` often returns `VERIFICATION_UNAVAILABLE` after consuming its verification budget. The report provides no device, platform, sample count, request sequence, timeout, or raw measurements, so these figures are investigation leads and are not baseline evidence or acceptance results. In this specification, measure target resolution, dispatch, post-action observation, and assertion costs separately. A failed light observation remains the successful-delivery/incomplete-evidence outcome defined by Spec 018; this work must not relabel it as an action failure or silently remove the observation.

## 3. Goals

1. Attribute journey latency to physical hierarchy acquisition, retries, metadata/resolution work, parsing, waits, and assertions, without recording UI contents or device serials.
2. Reduce physical reads or their per-read cost on the measured hot path.
3. Preserve fresh observations after actions and during asynchronous, in-place UI changes.
4. Preserve selector actionability, stale-reference protection, snapshot revisions/deltas, timeout handling, and existing verification modes.
5. Demonstrate the resulting speed and correctness on both a static fixture flow and a controlled network-backed flow.

## 4. Non-goals

- A cross-request or fixed-TTL cache of UI trees.
- Treating elapsed time alone as evidence that a tree is current.
- Weakening `expect_*` stabilization, two-sample checks, or the meaning of `light` and `full` verification.
- Changing screenshot, log, network, or debugger tools except for test instrumentation needed to distinguish their cost.
- Claiming an iOS latency gain from Android measurements.
- Depending on a live external service for the acceptance benchmark.

## 5. Observation and reuse contract

A **physical tree read** is one invocation of Android `uiautomator dump` and retrieval of its XML, or one invocation of iOS `idb ui describe-all`. A retry is another physical read. Metadata queries, display-resolution queries, parsing, and selector evaluation are separate timing components. An **observation** is a successfully parsed tree from one physical read, with its platform, resolved device, capture completion time, and snapshot revision. Failed reads have an error but produce no reusable observation.

An **observation transaction** is an internal call that names all consumers before starting one physical acquisition. It ends when that acquisition returns or fails. A consumer added later, including a later journey step, starts a new transaction unless an existing Spec 018 path explicitly passes the same tree within the ongoing step. This boundary avoids silently making a later assertion depend on a tree captured before a network update. Consumers must be declared before acquisition starts; this spec does not authorize coalescing independent concurrent calls. Existing same-step explicit tree passing remains permitted.

The implementation may share one completed observation among consumers in the same observation transaction only if all of these hold:

- The consumers use the same resolved platform and device.
- No action dispatch, app lifecycle operation, scroll, or other operation capable of changing the visible hierarchy occurred between them.
- Neither consumer requests a later or independent sample. In particular, stabilization windows, `not_exists` confirmation, and screen-fingerprint convergence retain their required separate reads.
- A caller that requests post-action evidence receives a read started after that action's dispatch, never the tree used to find its target.
- An observation that failed, timed out, or was cancelled is never reused.

The implementation MUST NOT persist a reusable tree across MCP requests. It MUST NOT report a reused tree with a new `captured_at_ms` or `snapshot_revision`. This spec does not permit single-flight sharing across independently entered calls. If a future implementation proposes such sharing, it needs a separate contract for waiter cancellation, per-caller deadlines, acquisition deadline ownership, and process-exit confirmation before the sharing change is implemented.

If these conditions cannot be proven at a call site, perform a fresh read. The specification permits optimizing metadata queries, resolution queries, the acquisition command, or parsing instead of introducing observation reuse.

## 6. Platform and failure behavior

The public `get_ui_tree`, `wait_for_ui`, selector tap, `expect_*`, `run_journey`, and debug-snapshot contracts remain as defined by existing specs. Compact responses continue to omit debug timing components. Diagnostic measurements are collected by the benchmark harness or an internal, opt-in test hook; they are not added to compact tool responses.

An expired operation or verification budget stops polling and terminates the active device command under the existing `ACTION_TIMEOUT` or verification-unavailable rules. It does not leave a background tree read that can overlap the next action. For this contract, termination is complete only when the spawned hierarchy command has emitted its close/exit event; sending a kill signal alone does not satisfy it. The caller must not start a subsequent device action until termination is confirmed. A failed acquisition keeps the existing observable error and retry behavior. If an optimization cannot supply a qualifying fresh tree, it falls back to the existing acquisition path within the same remaining deadline. The fallback must not start after the deadline.

Tree revisions and deltas are derived only from actual observations. Sharing one observation cannot create a new revision or a second stability sample. Device identity is resolved before any sharing decision; observations from different emulators, simulators, or platforms are isolated.

## 7. Measurement contract

Add internal instrumentation at the adapter boundary and journey call sites. For each measured run, record counts and elapsed milliseconds for:

| Field | Meaning |
|---|---|
| `physical_tree_reads` | Number of platform hierarchy commands started, including retries. |
| `tree_read_ms` | Android dump plus XML retrieval, or the iOS hierarchy command, from start to exit. |
| `metadata_ms` | Device metadata and capability checks performed for tree acquisition. |
| `capability_check_ms` | Platform tooling availability checks, when measured separately from metadata. |
| `resolution_ms` | Display-size acquisition, where applicable. |
| `parse_ms` | Parsing and conversion to the public element model. |
| `observation_wait_ms` | Intentional pre-read waits and polling delays. |
| `target_resolution_ms` | Time spent finding, selecting, and validating an actionable target before dispatch. |
| `dispatch_ms` | Time from action dispatch start until the platform action command completes. |
| `verification_budget_ms` | Effective light-verification budget for the action. |
| `verification_elapsed_ms` | Time spent obtaining the light post-action observation, including waits and failed attempts. |
| `verification_outcome` | `observed`, `unavailable`, or `not_requested`, matching the public action outcome. |
| `reused_observations` | Consumers served by an eligible existing observation. |
| `failed_tree_reads` | Commands that failed, timed out, or were cancelled. |

The measurement record also includes the journey step ID, observation purpose (`target`, `verification`, `assertion`, or `debug`), platform, and whether the read started before or after the preceding dispatch. Each physical acquisition has one unique internal acquisition ID and is recorded exactly once; each consumer use has a separate consumer record referring to that ID. When one acquisition serves multiple purposes, record one acquisition and all consumer records; do not duplicate its duration or physical-read count in aggregate totals. Count `failed_tree_reads` once for each hierarchy command that fails to start, exits unsuccessfully, times out, or is cancelled before successful output retrieval. A successful hierarchy command followed by empty/invalid output is a failed acquisition and is counted once. For light verification, record whether the observation budget expired, how much of the effective budget elapsed, and the associated acquisition IDs, including failed attempts. This data is used to determine whether `VERIFICATION_UNAVAILABLE` is driven by command acquisition, metadata, intentional waits, parsing, or the configured budget. The report groups acquisition cost and consumer count by step and purpose; raw timestamps need not be checked in. It MUST NOT include tree nodes, UI text, app identifiers, screenshots, logs, network payloads, or device serials.

The harness measures the full MCP request from write to complete response as in Spec 018. Timing components need not sum exactly to wall time where work overlaps, but the report must identify overlap and use wall time for performance gates.

## 8. Reproducible benchmark flows

Create `test/device/automated/ui-tree-performance/` and `docs/benchmarks/ui-tree-performance/`. Build on Spec 018's spawned `dist/server.js` client and Android fixture rather than introducing a second transport or test framework. First land only instrumentation and the benchmark fixture; capture that clean commit as the baseline using `benchmark.ts --baseline-only`, before changing acquisition behavior. The baseline-only run writes `baseline.json`. After choosing and implementing an optimization, measure the candidate against the same instrumentation, fixture APK SHA-256, emulator image, display settings, and host configuration. Record both commit SHAs, server version, platform/model/OS/API, command timeout, sample counts, failures, and request sequences.

The harness accepts `UI_TREE_BASELINE_ROOT`, `UI_TREE_CANDIDATE_ROOT`, and `LATENCY_DEVICE_ID`. Each root must be a clean, built checkout containing `dist/server.js`; missing or dirty inputs fail before a device reset. It starts each server over stdio from the supplied root, uses the single candidate fixture APK for both modes, and writes `baseline.json`, `candidate.json`, and `comparison.md` under `docs/benchmarks/ui-tree-performance/`. A reviewer can reproduce the comparison with:

```sh
UI_TREE_BASELINE_ROOT=/path/to/instrumented-baseline \
UI_TREE_CANDIDATE_ROOT=/path/to/optimized-candidate \
LATENCY_DEVICE_ID=emulator-5554 \
npx tsx test/device/automated/ui-tree-performance/benchmark.ts
```

Two flows are required:

1. **Static journey:** the Spec 018 navigation/control journey using `light`/`compact`, with the same actions and assertions in baseline and candidate. It isolates hierarchy overhead without network variance.
2. **Network-backed in-place update:** a deterministic local HTTP server drives an Android fixture screen from `loading` to `ready` after a configured delay, without navigation or a second MCP action. The fixture exposes stable accessibility IDs `loading`, `ready`, and `value`. For each attempt, the harness starts the fixture and server in a known reset state. The server holds the response until a completed MCP observation contains `loading` and contains neither `ready` nor `value`; it then starts the configured delay and sends `ready` with a run-unique value in the same response, recording a monotonic send timestamp and run ID. The harness then issues a fresh observation request after the response send event and asserts that one observation contains both `ready` and the matching run-unique value. A read that started before the response send event cannot satisfy this assertion even if it completes afterward. Run one response delay of 100 ms and one of 1,500 ms. Use emulator-to-host routing supplied by the harness; do not call a public service.

Both flows run sequentially, with three warm-ups followed by exactly ten measured attempts per flow, response-delay setting, and baseline/candidate mode. Failed runs are counted and excluded from percentiles, with the failed step and selector reported; any failed measured attempt fails acceptance. Screenshots and debug snapshots are outside the timed journeys and may be reported separately. Baseline and candidate order should alternate by run pair to limit emulator drift; the fixture and local server are reset before every run. The reports must state the timing boundary for every metric and include per-attempt acquisition/consumer records so the aggregation rules in Section 7 can be reproduced.

For iOS, automated unit tests with controlled `idb` output and the existing simulator smoke tests must cover correctness and cancellation. An iOS latency claim requires a reproducible iOS fixture and the same paired protocol; until then, report iOS performance as unmeasured.

## 9. Acceptance criteria

1. The baseline report identifies the physical-read count and p50/p95 time for each purpose and journey step, and distinguishes hierarchy command time from waits and parsing. It reports target-resolution, dispatch, and light-verification elapsed time and outcomes, including the rate and elapsed budget for `VERIFICATION_UNAVAILABLE`.
2. On the static Android journey, candidate p50 end-to-end time improves by at least 15% against its paired baseline, with no more than 5% p95 regression. At least one measured hot-path component must account for the gain; a response-size-only gain does not satisfy this spec.
3. On both network-backed delay settings, candidate p95 end-to-end time does not regress by more than 5%. The ready/value assertions never pass before the corresponding server response, and no run passes using a pre-update tree. The request start timestamp for the observation supplying the assertion must be later than that attempt's recorded response-send timestamp.
4. Baseline and candidate have zero assertion failures across the ten measured attempts per flow. Every failed warm-up or measured attempt remains visible in the report; no failed run contributes to a percentile.
5. Focused tests prove that a post-action assertion gets a post-dispatch read, two-sample stabilization uses two physical reads, device isolation holds, a failed/cancelled observation is not reused, and a budget expiry waits for hierarchy child-process exit before a subsequent device action can begin. Tests also prove one physical acquisition is counted once when explicitly passed to multiple same-step consumers, while all consumers receive records linked to that acquisition.
6. `npm run verify` and `npm run test:device` pass. Existing Spec 018 response-shape and journey tests continue to pass. The checked-in JSON and Markdown reports identify exactly which platforms and flows were measured.

If the 15% gate cannot be met without weakening freshness or verification, stop the optimization and report the measured bottleneck and failed gate. Do not lower the gate or mark this specification implemented on the strength of a synthetic unit benchmark.

## 10. Implementation plan and ownership

1. Add measurement hooks and reproduce the baseline before changing acquisition behavior. Validate the counters against a fake Android `adb` and fake iOS `idb` command so retries, invalid output, termination, and cancellations are counted once per actual acquisition and child-process exit is observable before the next action.
2. Use the baseline breakdown to select one or more changes in `src/observe/android.ts`, `src/observe/ios.ts`, `src/observe/index.ts`, or `src/interact/index.ts`. Document why each changed read is redundant or why its replacement is equivalently fresh.
3. Preserve the contracts in Section 5 with focused unit tests under `test/unit/observe/` and `test/unit/interact/`. Add the controlled network fixture and harness under `test/device/automated/`.
4. Run the paired benchmarks and required repository gates. Check in baseline and candidate reports, update tool documentation only if user-visible behavior changes, and record any unmeasured platform separately.

The benchmark and fixture belong to this repository. No backend or third-party service is required. Device testing requires the Android SDK/emulator and, for iOS smoke checks, a booted simulator with `idb`; inability to access either is an execution blocker for that platform's acceptance check, not evidence that it passed.

## 11. Baseline decision and result

The initial Android baseline found 20 physical tree reads in each measured
static journey, including independent assertion samples, and an approximately
400 ms intentional wait before every first attempt. No cross-request tree
reuse was added. The candidate starts the first Android read immediately and
retains the wait for retries. The clean repeat paired run improved static p50
from 52.40 s to 43.82 s (16.4%) with no network p95 regression or failed
attempts. A prior paired attempt had two network failures and is retained in
the benchmark directory; its cause remains unconfirmed. This result does not
claim that `VERIFICATION_UNAVAILABLE` is eliminated in other apps.
