

# RFC 010 — Verification Stabilization and Temporal Convergence

## 1. Summary

This RFC defines a verification stabilization layer that ensures UI state transitions are not misclassified due to timing instability, transient UI states, or stale snapshots.

It introduces temporal semantics into verification so that readiness and state checks are based on convergence over time, not a single snapshot.

---

## 2. Problem Statement

Current verification behavior is snapshot-based and may produce false-negative failures when UI state is in transition.

Observed issues include:

- readiness checks timing out even though UI converges shortly after
- stale snapshots being treated as authoritative state
- transient UI states causing premature failure classification
- mismatch between UI convergence and verification success

These issues lead to unnecessary retries, incorrect failure classification, and degraded automation reliability.

---

## 3. Goals

This RFC introduces a temporal verification model that MUST:

- reduce false-negative readiness failures
- ensure verification reflects stable UI convergence
- introduce bounded recheck before failure
- debounce transient mismatches
- maintain deterministic verification behavior

---

## 4. Non-Goals

This RFC does NOT define:

- recovery or replanning strategies (covered by a later RFC)
- probabilistic verification
- ML-based state inference
- changes to action execution semantics

Verification remains deterministic and grounded in observable UI state.

---

## 5. Runtime Ownership and Integration

This RFC applies to existing verification surfaces:

- expect_* handlers (e.g. expect_state)
- readiness checks in wait_for_ui_element
- post-action verification in src/interact

It augments these surfaces with temporal semantics; it does not replace them.

### 5.1 Ownership and Composition with Existing Logic

This RFC refines existing behavior rather than introducing a parallel mechanism.

- `wait_for_ui_element` (and underlying `waitForUICore`) owns **readiness stabilization**.
- `expect_*` handlers (e.g. `expect_state`) own **state verification stabilization**.
- `src/interact` owns **post-action verification application** of these rules.

Composition rules:
- `wait_for_ui_element` MUST apply stabilization for presence/readiness before returning success or failure.
- `expect_*` MUST apply stabilization for state/value assertions.
- If both are used in sequence, `wait_for_ui_element` completes first, then `expect_*` applies its own stabilization.
- Stabilization MUST NOT be duplicated across layers for the same check.

---

## 6. Temporal Verification Model

Verification MUST consider state over time, not a single observation.

### 6.1 Stabilization Window

Verification SHOULD use a bounded observation window before declaring failure.

Within this window:
- multiple UI reads MAY be performed
- transient mismatches MUST NOT immediately trigger failure

### 6.2 Verify-Until-Stable

Verification SHOULD require state to be stable across consecutive observations before success is confirmed.

Example:
- state must match expected condition for N consecutive reads

### 6.3 Debounce Semantics

Transient mismatches SHOULD be debounced.

Short-lived mismatches within the stabilization window MUST NOT be treated as terminal failure.

### 6.4 Deterministic Defaults (Required)

Implementations MUST use bounded defaults unless explicitly overridden:

- `stabilization_window_ms`: 1000ms (range: 500–1500ms)
- `stable_observation_count`: 2 consecutive matching reads
- `max_recheck_attempts`: 3
- `min_read_interval_ms`: 100–200ms between reads

These values MUST be configurable but bounded to prevent unbounded waits.

---

## 6.1 Reference Stabilization Algorithm

For a given verification predicate `P(snapshot)`:

1. Start timer `t0`.
2. Initialize `stable_count = 0`, `attempts = 0`.
3. Loop until `now - t0 > stabilization_window_ms` OR `stable_count >= stable_observation_count`:
   - Read fresh snapshot `S`.
   - If `P(S)` is true:
       - `stable_count += 1`
     Else:
       - `stable_count = 0`
   - `attempts += 1`
   - Sleep `min_read_interval_ms`.
4. If `stable_count >= stable_observation_count`: SUCCESS
5. Else if `attempts < max_recheck_attempts`:
   - Perform one additional fresh read and re-evaluate once.
6. Else: FAILURE

Notes:
- Implementations MUST ensure at least one fresh read occurs before failure.
- Debounce is achieved via resetting `stable_count` on mismatch.

---

## 7. Snapshot Freshness

Verification MUST account for snapshot freshness.

### 7.1 Freshness Constraints

- snapshots older than `snapshot_stale_threshold_ms` MUST be considered stale (default: 500ms)
- stale snapshots MUST NOT be used as final verification evidence and MUST trigger a fresh read

### 7.2 Re-read Requirement

Before declaring failure, the system MUST attempt at least one fresh UI read within the stabilization window.

### 7.3 Freshness Defaults

- `snapshot_stale_threshold_ms`: 500ms (range: 300–800ms)

---

## 8. Runtime Failure Code Mapping

Existing runtime failure signals MUST map into RFC 010 failure categories.

| Runtime Code | RFC 010 Category |
|--------------|------------------|
| ELEMENT_NOT_FOUND | Target Resolution Failure |
| STALE_REFERENCE | Target Resolution Failure |
| AMBIGUOUS_TARGET | Target Resolution Failure |
| TIMEOUT | Execution Failure |
| ACTION_REJECTED | Execution Failure |
| VERIFICATION_FAILED | Verification Failure |
| EXPECT_STATE_MISMATCH | Verification Failure |
| CONTROL_CONVERGENCE_FAILED | Control Convergence Failure |
| SEMANTIC_MISMATCH | Semantic Mismatch Failure |
| UNKNOWN | Execution Failure (default fallback) |

This mapping MUST be deterministic, exhaustive, and versioned with the runtime.

### 8.1 Failure Gating Rules

Failure MUST only be emitted when:

- stabilization window is exhausted
- fresh snapshot verification still fails

Transient mismatches SHOULD NOT be classified as:
- TIMEOUT
- VERIFICATION_FAILED

until stabilization logic has completed.

- FAILURE MUST NOT be emitted if `stable_observation_count` has not been attempted within the stabilization window.
- FAILURE MUST NOT be emitted without at least one fresh read within `snapshot_stale_threshold_ms`.
- TIMEOUT MUST correspond to exhaustion of `stabilization_window_ms`, not a single read failure.

---

## 9. Integration with RFC 005 (Verification Correctness)

RFC 005 defines what correctness means.

RFC 010 defines when correctness can be confidently evaluated.

RFC 010 augments RFC 005 by introducing temporal convergence requirements before asserting success or failure.

---

## 10. Integration with RFC 006 (Execution Layer)

Post-action verification in src/interact MUST apply stabilization logic before returning failure.

Execution MUST NOT prematurely surface verification failure without applying temporal checks defined in this RFC.

`src/interact` MUST wrap post-action verification with the reference stabilization algorithm. It MUST pass through configuration (window, counts) and MUST NOT short-circuit on first mismatch.

---

## 11. Integration with RFC 011.1 (Recovery Contract)

Verification stabilization reduces false-positive failure signals that would otherwise trigger downstream recovery mechanisms (defined in a companion RFC).

---

## 13. Output Behavior (Progressive Extension)

Future implementations MAY expose additional metadata such as:

```ts
interface VerificationMetadata {
  stabilization_attempts?: number;
  stabilization_window_ms?: number;
  stable_observation_count?: number;
  snapshot_freshness_ms?: number;
}
```

These fields are optional and for observability only.

---

## 14. Failure Modes

Verification stabilization MAY fail due to:

- UI never converging to expected state
- repeated oscillation of UI state
- persistent stale snapshot conditions

In these cases, failure MUST be emitted after stabilization window is exhausted.

---

## 15. Success Metrics

- reduced false-negative readiness failures
- higher first-pass verification success
- lower premature timeout rates
- improved reliability of wait and readiness checks

---

## 16. Summary

This RFC introduces temporal stabilization into verification, ensuring that UI state is evaluated based on convergence over time rather than single snapshots. It improves reliability by eliminating transient mismatches and stale-state errors without introducing probabilistic behavior.
