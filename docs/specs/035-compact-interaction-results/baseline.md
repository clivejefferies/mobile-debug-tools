# Baseline investigation — 2026-11-05

Local source fixtures executed using Node v23.11.0 and `node --import tsx` against
current actionHandler, correlation, evidence and readiness code. Native calls were
replaced by fixtures. These are response/serialization evidence, not device success.
Four cases used a concrete fixture device, awake/unlocked readiness, UUID IDs,
monotonic dispatch evidence and (for observed) one post-dispatch fingerprint capture.
The failure fixture marked dispatch started and returned ACTION_TIMEOUT; the blocked
fixture returned ELEMENT_NOT_FOUND without dispatch. Timings vary slightly per run.

| Fixture | Current bytes | Proposed projection bytes | Reduction |
| --- | ---: | ---: | ---: |
| Dispatch-only success | 1129 | 836 | 26% |
| Success with one observed fingerprint | 1639 | 854 | 48% |
| Failed after dispatch | 1157 | 864 | 25% |
| Blocked before dispatch | 1106 | 831 | 25% |

Projection numbers are serialized design prototypes, not implemented behaviour.
They preserve action fields; remove readiness evidence entries and evidence timing/
observation arrays; add observed_state and diagnostics UUID references. They establish
feasibility for a 1,280-byte budget, not validation of the complete contract. Exact
semantic tests and the full adversarial budget matrix remain implementation work.
Token estimates use ceil(bytes/4); no tokenizer measurement has been performed.

All fixtures currently retain action_id/type, success, lifecycle_state,
delivery_status, dispatch_started, verification, total timing, full device_readiness
and full evidence envelope. Failure/blocked fixtures also retain failure_code and
retryable. Full evidence repeats device/IDs/timestamps per observation. Compact
currently drops detailed errors even when internally available. Light mode may add
state_delta arrays; failed conditions can retain an entire observed tree. Journey
results nest per-action envelopes. These variable-size paths require budget tests.

## Connected server/device evidence

The connected MCP server listed Android emulator-5554 (Android 16) and Pixel 9 Pro
(Android 17); all listed iOS simulators were shut down. A screenshot on emulator-5554
showed Android Settings. One tap on blank header space (360,80), compact/none,
reported dispatch delivered and verification not_requested. No post-action UI read
was performed, so resulting UI state is unknown. No setting change was requested.

The connected tap returned 831 UTF-8 bytes (208 tokens using the bytes/4 estimate).
The connected tap omitted device_readiness, unlike the local checkout. Its exact
server build is unavailable through this call, so it is not current-source proof.
The response had full evidence envelope and no observations. Physical Android and
iOS interaction paths were unrun. No performance conclusion follows from this call.
