# Spec 021: app readiness signals

Date: 2026-10-29. Status: approved — implementation authorised.
Source: [issue #65](https://github.com/clivejefferies/mobile-debug-tools/issues/65).
[Intent](intent.md) approved by the originator’s “yes” in this conversation.

## Behaviour and scope

Report readiness of the observed foreground device UI on Android/iOS. This is
not proof of a particular app’s identity, backend completion, or safe input.
Reuse snapshot signatures, loading observations, device resolution, and budgets.
Do not infer readiness from screenshots or input-dispatch success.

Initial supported states are `loading`, `transitioning`, `settled`, and `unknown`.
Reserve `unresponsive` and `debugger_paused`, but report their capabilities as
unsupported on both platforms: there is currently no authoritative process-health
or debugger-session provider. A timeout must never manufacture either state.
Adding those providers requires a subsequent spec decision; this feature does
not implement a debugger, recovery, restart, or performance profiling.

## Public contracts

Add tools `get_app_readiness` and `wait_for_app_ready`, requiring `platform`
(`android`/`ios`) and optionally accepting `deviceId`. Resolve and pin one concrete
device per call. Both accept strict integer controls:

| Control | Default | Range |
| --- | --- | --- |
| `timeoutMs` | get: 15000; wait: 30000 | 100–60000 |
| `stabilityMs` | 500 | 100–10000 |
| `pollIntervalMs` (wait only) | 500 | 100–1000 |

Reject invalid/unknown arguments as `INVALID_ARGUMENT` before device work.
`get_app_readiness` takes at most two fresh samples, separating their acquisitions
by at least `stabilityMs`. A loading first sample can return immediately. The
wait tool samples until settled or its deadline. Reads are sequential; never
start a background poller or overlap hierarchy dumps within a call.

Both return `{ success, device, readiness, elapsed_ms, failure_code? }`.
For get, success means a supported state was established; `unknown` is unsuccessful.
For wait, only `settled` is successful. Unsuccessful codes are
`READINESS_UNAVAILABLE` (get), `READINESS_TIMEOUT` (wait deadline), and
`DEVICE_UNAVAILABLE` (resolution/disconnection prevents continuation).

`readiness` contains:

- `state`, `scope: device_ui`, and `basis` (`observed`, `heuristic`, or `insufficient`).
- `captured_at_ms` (latest successful sample, or null), `sample_count`,
  `stable_for_ms`, and nullable `snapshot_session_id`/`snapshot_revision`.
- `evidence`: bounded records of signal code, source, capture time, and snapshot
  revision; maximum eight, newest retained. No full text, logs, screenshots, or trees.
- `limitations`: applicable codes from `INSUFFICIENT_SAMPLES`, `OBSERVATION_FAILED`,
  `OBSERVATION_INVALID`, `DEADLINE_EXCEEDED`, `NORMALIZED_UI_ONLY`,
  `FOREGROUND_APP_UNVERIFIED`, `UNRESPONSIVE_SIGNAL_UNSUPPORTED`, and
  `DEBUGGER_SIGNAL_UNSUPPORTED`.
- `capabilities`: true for loading/transition/stability observation; false for
  unresponsive/debugger-paused detection in this version.

Add the same `readiness` summary to debug/compact `get_ui_tree` and nested tree
observations without additional reads. Single-sample summaries can only report
loading or unknown; separate calls never silently share a stability window.
Preserve existing fields, compact error evidence, and delta behaviour.

Add opt-in `requireReady: boolean` (default false) to `wait_for_ui` and
`wait_for_ui_change`. When enabled, success requires the existing predicate and
settled readiness on the same current samples. Reuse those waits’ samples and
single existing deadline; do not add another wait budget or unrelated tree reads.
Return `readiness` alongside the existing envelope. On expiry retain the existing
timeout/failure shape and include readiness limitations. Default calls retain
existing predicate semantics; no new journey assertion type is introduced.

## Classification rules

| Evidence | State / basis |
| --- | --- |
| Visible native `android.widget.ProgressBar`, `ActivityIndicator`, or `ProgressIndicator` | loading / observed |
| Visible label exactly “Loading” or “Please wait”, ignoring case, whitespace, and trailing full stops/ellipsis | loading / heuristic |
| Two valid consecutive signatures differ | transitioning / observed |
| At least two valid identical signatures spanning `stabilityMs`, without loading evidence | settled / observed |
| Missing, failed, invalid, or insufficient evidence | unknown / insufficient |

Loading takes precedence over stability. Do not reuse the broad existing
`loading_state` keyword heuristic as proof: a button named “Progress” is not an
active loader. Keep that legacy field unchanged for compatibility.

Use full normalized snapshot signatures, including state and bounds, not the
coarser screen fingerprint or truncated delta. A change resets stability;
failed reads break consecutive-sample continuity. Validate device/session,
revision, a finite capture timestamp from this acquisition, nonempty elements,
and positive finite resolution. Never accept retained metadata as a fresh read.
Track elapsed/stability intervals with a monotonic clock; expose wall-clock
capture timestamps only as evidence. Results describe their capture window,
not a guarantee that the UI stays settled afterward.

## Failure, lifecycle, and privacy

Bound acquisition, retries, and delays by the remaining operation budget and any
outer deadline. No late sample may produce success. Terminate/await owned timed-out
subprocesses; perform no follow-up snapshot after expiry. Waits can retry transient
observation failures within budget, with continuity reset; disconnect is terminal.
Retain the last supported state on wait timeout only as timestamped evidence,
with `DEADLINE_EXCEEDED`; if the latest read failed, current state is unknown.
There is no cancellation argument. Existing transport cancellation does not
currently abort platform reads; those reads remain bounded by their deadlines.
Do not claim immediate cancellation support or create persistent sessions.
Do not reset network windows, dispatch input, or retain cross-request histories.
Do not log UI payloads or input text. No permissions, dependencies, migrations,
or automatic package release are required.

## Acceptance and verification

- Loading outranks identical trees; changing trees transition; consecutive stable
  valid trees settle. Text-only loading is explicitly heuristic.
- A frozen-looking screenshot, stable tree, slow dump, timeout, or missing loader
  cannot establish responsiveness, debugger pause, or app/backend completion.
- Error/empty/stale-session/wrong-device samples never settle; failures reset
  continuity. Deadlines prevent late success and background work.
- New summaries preserve compact/debug evidence and existing defaults; opt-in
  waits require both their predicate and readiness.
- Every state has evidence and limitations; unsupported capabilities are explicit.

Use deterministic native-adapter/clock fixtures for transitions, failures,
timeouts, isolation, and schema parity. Run `npm run verify`, `npm run test:device`,
and updated-server Android/iOS journeys for stable content, a controlled loader
transition, bounded waiting, and opt-in predicate waits. Record simulator/build,
results, and unsupported coverage in the plan after approval.

## Investigation and approval

Existing owners: `src/observe/snapshot-metadata.ts`, `src/observe/index.ts`,
`src/interact/index.ts`, server schemas/handlers, shared types and operation budgets.
The legacy idle wait can compare null fingerprints; the new classifier must not
copy that inference. No debugger/readiness module currently exists.

Read-only reconnaissance used the connected server (exact build not reported;
local checkout 0.32.4). Android 16 `emulator-5554`: two fresh 15-element trees,
same revision 9, no loading hint, reads about 4.4/3.0 seconds. iOS 26.4 iPhone 17
Pro `F9243BAF-62A8-4990-8A99-17F527F56FDA`: two fresh 14-element trees, revision
10, no loading hint, reads about 3.4/2.0 seconds. These establish available
observation routes, not feature passes; no inputs or settings were changed.

Approved by the originator’s “yep” on 2026-10-29 in direct response to this
spec and first-version scope, including unsupported unresponsive/debugger-paused
detection and opt-in existing-wait integration.
