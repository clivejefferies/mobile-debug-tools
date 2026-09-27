# RFC 011.1 — Recovery Contract Types & Runtime Wiring Spec

## 1. Purpose

This document defines the typed runtime contract required to implement RFC 011 safely and consistently across:

- src/server
- src/interact
- shared action/result boundaries

It removes ambiguity from RFC 011 by formalising:
- enums
- state schemas
- execution payloads
- failure propagation format

---

## 2. Design Principle

Recovery is not a behaviour description.

It is a typed state machine over execution results.

All recovery decisions MUST be derivable from structured runtime data.

---

## 3. Core Runtime Types

### 3.1 Failure Class

```ts
type FailureClass =
  | "TargetResolutionFailure"
  | "ExecutionFailure"
  | "VerificationFailure"
  | "ControlConvergenceFailure"
  | "SemanticMismatchFailure";
```

---

### 3.2 Recovery Strategy

```ts
type RecoveryStrategy =
  | "re_resolve"
  | "alternate_candidate"
  | "state_refresh"
  | "retry_adjustment"
  | "step_back";
```

---

### 3.3 Runtime Failure Code

```ts
type RuntimeFailureCode =
  | "ELEMENT_NOT_FOUND"
  | "STALE_REFERENCE"
  | "AMBIGUOUS_TARGET"
  | "TIMEOUT"
  | "ACTION_REJECTED"
  | "VERIFICATION_FAILED"
  | "EXPECT_STATE_MISMATCH"
  | "CONTROL_CONVERGENCE_FAILED"
  | "SEMANTIC_MISMATCH"
  | "UNKNOWN";
```

---

### 3.4 Recovery State

```ts
interface RecoveryState {
  failure_class: FailureClass;
  runtime_code: RuntimeFailureCode;

  recovery_strategy?: RecoveryStrategy;

  recovery_attempts: number;
  max_recovery_attempts: number;

  retry_depth: number;
  max_retry_depth: number;

  is_terminal: boolean;

  // derived from runtime retryable signal
  retry_allowed?: boolean;
}
```

---

## 4. Execution Result Integration (ActionExecutionResult)

This RFC does NOT introduce a new execution result type. Instead, it extends the existing runtime ActionExecutionResult / tool response envelope.

The recovery contract MUST be attached as an extension field.

```ts
type ActionExecutionResult = {
  success: boolean;

  action_type: string;
  target_id?: string;

  // existing runtime error representation (already present in system)
  failure_code?: RuntimeFailureCode;

  // existing runtime retry signal
  retryable?: boolean;

  // RFC 011.1 extension
  recovery?: RecoveryState;
};
```

The recovery extension MUST NOT replace or duplicate existing failure_code semantics. Instead, failure_code remains the source input for deriving FailureClass and RecoveryState. RecoveryState is a structured interpretation layer built on top of existing execution results.

Existing retryable semantics remain authoritative for whether an action may be directly retried.

- retryable answers whether an execution may be retried.
- RecoveryState defines how recovery proceeds when failure occurs.

RecoveryState augments retryability; it does not replace it.

---

## 5. Server → Interact Contract

### 5.1 Server responsibilities
- map raw runtime errors → RuntimeFailureCode
- attach initial FailureClass
- initialise recovery state defaults

### 5.2 Interact responsibilities
- consume RecoveryState
- mutate recovery_attempts and retry_depth
- select RecoveryStrategy
- enforce bounds

Interact is the only layer allowed to mutate recovery state.

---

## 6. Deterministic Mapping Function

```ts
function mapRuntimeCodeToFailureClass(code: RuntimeFailureCode): FailureClass {
  switch (code) {
    case "ELEMENT_NOT_FOUND":
    case "STALE_REFERENCE":
    case "AMBIGUOUS_TARGET":
      return "TargetResolutionFailure";

    case "TIMEOUT":
    case "ACTION_REJECTED":
    case "UNKNOWN":
      return "ExecutionFailure";

    case "VERIFICATION_FAILED":
    case "EXPECT_STATE_MISMATCH":
      return "VerificationFailure";

    case "CONTROL_CONVERGENCE_FAILED":
      return "ControlConvergenceFailure";

    case "SEMANTIC_MISMATCH":
      return "SemanticMismatchFailure";
  }
}
```

---

## 7. Step-back Semantics

Step-back MUST be implemented as re-entry into resolution + execution pipeline, NOT state rollback.

---

## 8. Budget Enforcement Rules

```ts
const RECOVERY_LIMITS = {
  max_recovery_attempts: 3,
  max_retry_depth: 3
};
```

- MUST increment recovery_attempts per recovery cycle
- MUST increment retry_depth per re-resolution loop
- MUST terminate when limits exceeded

### Retryability Gating Rules

Recovery strategies MUST honor existing retryable semantics.

If retryable=false:
- direct identical-action retry MUST NOT be selected
- retry_adjustment MUST NOT be selected
- re_resolve or alternate_candidate SHOULD be preferred

If retryable=true:
- retry_adjustment MAY be selected subject to recovery budgets

This prevents contradiction between runtime execution constraints and recovery policy.

---

## 9. Failure Output Contract

```ts
interface TerminalFailure {
  failure_class: FailureClass;
  runtime_code: RuntimeFailureCode;

  resolved_target?: string;

  recovery_attempts: number;

  attempted_recovery_strategies: RecoveryStrategy[];

  final_state: "failed";
}
```

---

## 10. Integration Summary

This spec defines the typed contract required for implementing RFC 011 across server and interact layers.

### 10.1 Runtime Wiring Constraint

This specification MUST be implemented by extending existing ActionExecutionResult objects in both src/server and src/interact.

No new parallel execution envelope is permitted.

RecoveryState is an additive field only.

Failure interpretation MUST continue to use existing failure_code fields as the source of truth.

---

## 11. Summary

This document formalises recovery as a deterministic, typed execution subsystem.
