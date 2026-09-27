

# RFC 011 — Recovery and Replanning for Failed or Ambiguous Interaction Flows

## 1. Summary

This RFC defines a structured recovery and replanning model for UI interaction failures, enabling the system to respond to execution uncertainty with bounded, deterministic recovery strategies.

It extends the interaction stack defined in RFCs 005–009 by introducing explicit failure classification, recovery policy selection, and bounded replanning of interaction sequences.

---

## 2. Problem Statement

Even with reliable execution primitives (RFC 005–009), UI interactions can fail due to:

- incorrect or stale target resolution
- state drift between observation and execution
- ambiguous or partial UI snapshots
- control convergence failures (RFC 008)
- semantic mismatches in custom/Compose controls (RFC 009)

Currently, failure handling is implicit and ad hoc, often resulting in:

- repeated identical retries
- stalled flows with no recovery path
- loss of interaction context
- inability to switch strategy after failure

This leads to brittle automation behavior even when core primitives are correct.

---

## 3. Goals

This RFC introduces a structured recovery system that MUST:

- classify failures into distinct categories
- select appropriate recovery strategies based on failure type
- enable bounded replanning of interaction flows
- prevent infinite retry loops
- preserve interaction context across recovery attempts
- improve robustness under UI drift or ambiguity

---

## 4. Non-Goals

This RFC does NOT define:

- new UI interaction primitives (covered in RFC 006–008)
- new target resolution mechanisms (RFC 007)
- new control semantics (RFC 008–009)
- general autonomous planning system
- ML-based decision making or probabilistic policy learning

Recovery is deterministic and rule-based in this version.

---

## 5. Runtime Ownership and Integration

Recovery is a cross-layer concern with explicit ownership:

### 5.1 Server Layer (src/server)
- Detects failure conditions from action execution results
- Emits normalized failure objects
- Applies initial failure classification mapping

### 5.2 Interact Layer (src/interact)
- Executes recovery strategies
- Performs re-resolution, retry, and step-back operations where supported
- Maintains bounded retry loops

### 5.3 Shared Contract Layer
- Defines failure schema
- Defines recovery state machine transitions

Recovery is NOT owned by a single layer; it is a coordinated contract between server and interact.

---

## 5. Failure Classification Model

All interaction failures MUST be classified into one of the following categories:

### 5.1 Target Resolution Failure
- element not found
- ambiguous or multiple matches
- stale UI tree snapshot

### 5.2 Execution Failure
- action could not be dispatched
- runtime rejection of interaction
- invalid gesture or control interaction

### 5.3 Verification Failure
- action executed but expected state not observed
- expect_state mismatch (RFC 005)

### 5.4 Control Convergence Failure
- adjustable control failed to reach target state (RFC 008)

### 5.5 Semantic Mismatch Failure
- control semantics inferred incorrectly (RFC 009)

---

## 6. Runtime Failure Code Mapping

Existing runtime failure signals MUST map into RFC 011 failure categories.

| Runtime Code | RFC 011 Category |
|--------------|------------------|
| ELEMENT_NOT_FOUND | Target Resolution Failure |
| STALE_REFERENCE | Target Resolution Failure |
| AMBIGUOUS_TARGET | Target Resolution Failure |
| TIMEOUT | Execution Failure |
| ACTION_REJECTED | Execution Failure |
| VERIFICATION_FAILED | Verification Failure |
| EXPECT_STATE_MISMATCH | Verification Failure |
| CONTROL_CONVERGENCE_FAILED | Control Convergence Failure |
| UNKNOWN | Execution Failure (default fallback) |

This mapping MUST be deterministic and versioned with the runtime.

---

## 6. Recovery Strategy Model

Each failure type MUST map to a bounded set of recovery strategies:

### 6.1 Re-resolve Strategy
Re-run target resolution (RFC 007) with updated context.

Used for:
- stale snapshot
- ambiguous target

---

### 6.2 Alternate Candidate Strategy
Select next-best candidate from resolved targets.

Used for:
- multiple matches
- incorrect initial resolution

---

### 6.3 State Refresh Strategy
Re-observe UI state before retrying action.

Used for:
- drift between observation and execution

---

### 6.4 Retry with Constraint Adjustment
Retry action with adjusted parameters:
- increased tolerance (RFC 008)
- alternative interaction mode

Used for:
- convergence failures
- flaky execution paths

---

### 6.5 Step-back Strategy
Rollback interaction context one step and re-enter flow.

Used for:
- persistent verification failure
- inconsistent UI state transitions

---

## 7. Replanning Model

Replanning is the process of constructing a new bounded interaction sequence after failure.

A replanned sequence MUST:

- preserve original intent
- incorporate failure classification context
- apply a recovery strategy
- remain bounded in retry depth

Replanning is NOT full autonomous task planning.

---

## 7.1 Scope of Replanning

Replanning in this RFC is strictly scoped to:

- Single-action recovery sequences
- Local retry chains
- Bounded corrective adjustments

It does NOT include:

- multi-step autonomous task planning
- global goal decomposition
- long-horizon planning

Replanning is therefore a bounded extension of execution, not a planning system.

---

## 8. Recovery State and Budget Contract

The system MUST represent recovery state explicitly per action.

### 8.1 Recovery State Schema (conceptual)

{
  "failure_class": "TargetResolutionFailure | ExecutionFailure | VerificationFailure | ControlConvergenceFailure | SemanticMismatchFailure",
  "recovery_strategy": "re_resolve | alternate_candidate | state_refresh | retry_adjustment | step_back",
  "recovery_attempts": 0,
  "max_recovery_attempts": 3,
  "retry_depth": 0,
  "max_retry_depth": 3
}

### 8.2 Budget Rules

- Each action MUST track recovery_attempts
- Recovery MUST NOT exceed max_recovery_attempts
- retry_depth MUST be bounded per interaction step
- Exhaustion MUST produce a terminal failure state

### 8.3 Enforcement Point

Budget enforcement is the responsibility of the Interact layer (src/interact), with server providing initial values.

---

## 9. Execution Context Model

Full rollback is NOT required or assumed.

The system MUST preserve:

- last resolved target set (RFC 007)
- last executed action descriptor (RFC 006)
- last verification result (RFC 005)
- recovery_attempts counter

The system MAY optionally retain:

- prior candidate selections
- intermediate resolution outputs

Step-back is implemented as a re-resolution + re-execution, NOT a full state rollback system.

---

## 10. Relationship to Existing RFCs

### RFC 005 — Correctness Model
Defines verification failures that trigger recovery.

### RFC 006 — Runtime Binding
Defines execution surface where failures occur.

### RFC 007 — Target Resolution
Provides alternate candidates for recovery strategies.

### RFC 008 — Control-State Convergence
Defines recovery paths for control adjustment failures.

### RFC 009 — Semantic Control Model
Defines classification of semantic mismatch failures.

---

## 11. Expected System Behaviour

On failure:

1. classify runtime failure using deterministic mapping (Section 6)
2. select recovery strategy
3. optionally re-resolve target
4. re-execute bounded action
5. verify outcome using RFC 005 or mark recovery attempt failure
6. escalate if budget exceeded

---

## 12. Structured Failure Output Contract

When recovery is exhausted or fails, the system MUST emit a structured failure object:

{
  "failure_class": "...",
  "runtime_code": "...",
  "resolved_target": "...",
  "attempted_recovery_strategies": ["..."],
  "recovery_attempts": 3,
  "final_state": "failed"
}

This ensures consistent observability across server and interact layers.

---

## 12. Success Metrics

- reduction in stuck interaction flows
- reduced repeated identical retries
- improved recovery success rate after first failure
- improved robustness under UI drift
- clearer structured failure outputs

---

## 13. Summary

This RFC introduces deterministic recovery and replanning for UI interaction failures, enabling the system to remain robust under ambiguity, drift, and execution uncertainty while preserving bounded and explainable behavior.
