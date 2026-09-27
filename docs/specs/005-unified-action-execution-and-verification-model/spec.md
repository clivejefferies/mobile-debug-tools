# RFC 005 — Unified Action Execution and Verification Model

## 1. Summary

This RFC defines a unified execution and verification model for all agent-driven UI actions.

It standardises:
- how actions are resolved
- how they are executed
- how outcomes are verified
- how failures are classified
- how observability signals are emitted

The goal is to eliminate inconsistent per-feature execution logic and establish a single deterministic lifecycle for all UI interactions.

---

## 2. Problem Statement

Current execution paths are fragmented across interaction types:

- Tap / click actions rely on implicit success assumptions
- Control adjustments (sliders, inputs) use ad-hoc verification logic
- Gesture actions lack consistent post-execution validation
- Action success is often inferred from indirect UI changes or logs

This leads to:
- ambiguous success states
- inconsistent retries
- weak failure classification
- poor observability signal quality

---

## 3. Design Goals

The model must:

- Provide a single lifecycle for all actions
- Separate target resolution from execution
- Require explicit verification of state change
- Standardise failure classification
- Integrate with observability systems cleanly
- Support both simple and parameterised actions

---

## 4. Action Lifecycle

Every action MUST pass through the following states:

1. Resolved
   - A target has been identified via Actionability Resolution
   - The target is executable (not just visible)

2. Dispatched
   - The action has been issued to the runtime layer

3. Pending Verification
   - Waiting for expected UI or state change

4. Verified
   - Expected outcome confirmed

5. Failed
   - Verification did not succeed within constraints

---

## 5. Action Types

All actions are categorised into canonical types:

- Navigation
- Input
- Selection
- Gesture
- Control Adjustment

Each type may have type-specific execution adapters but MUST conform to the same lifecycle.

---

## 6. Execution Contract

All actions MUST define:

### 6.1 Target
A resolved executable entity (not a UI label or text node)

### 6.2 Intent
The intended effect of the action

### 6.3 Expected State Delta
What must change in the UI or application state

---

## 7. Verification Model

Verification MUST be explicit and deterministic.

### 7.1 Verification Sources
At least one must be used:

- UI state diff
- element property change
- navigation change
- value update (for controls)

### 7.2 Timeout Behaviour
- Each action defines a verification window
- Failure occurs if no valid state delta is observed in time

### 7.3 No Implicit Success
Actions MUST NOT be considered successful without explicit verification.

---

## 8. Actionability Integration

This model depends on Actionability Resolution:

- Only resolved executable targets may be executed
- Visible but non-actionable nodes are invalid targets
- Execution is blocked if confidence is below threshold

---

## 9. Control Adjustment Model

Control actions (sliders, inputs) are treated as parameterised actions:

Example:

set_slider_value(target, value, tolerance)

Must include:
- pre-state value
- post-state verification
- tolerance-aware validation

Fallback to coordinate-based interaction is allowed only if semantic control resolution fails.

---

## 10. Observability Hooks

Each action emits structured signals:

- action_id
- target_id
- action_type
- lifecycle_state transitions
- verification result
- failure reason (if applicable)

These signals feed:
- Signal-Oriented Diagnostic Filtering
- Action Trace Correlation

---

## 11. Failure Classification

Failures MUST be categorised:

- Target resolution failure
- Dispatch failure
- Verification timeout
- Unexpected state delta
- No state change observed

This enables consistent debugging and telemetry.

---

## 12. Relationship to Existing Roadmap

This RFC provides the foundation for:

- Actionability Resolution (#4)
- Adjustable Control Support (#5)
- Signal-Oriented Diagnostic Filtering (#6)

It defines the shared execution substrate those capabilities plug into.

---

## 13. Scope Boundary

This RFC defines the execution model and lifecycle semantics for agent-driven UI actions.

- Action types referenced in this RFC correspond to the existing runtime `action_type` contract and do not redefine or extend the underlying taxonomy
- Lifecycle signals described in this RFC are emitted by the runtime execution layer (defined in RFC 006), not by this specification directly

It does NOT define:
- runtime instrumentation details
- how lifecycle states are emitted in code
- mapping to specific source modules (e.g. src/server, src/interact)
- tool schema implementation details
- mapping between semantic action categories and runtime implementation modules (this is defined in RFC 006)

Those concerns are delegated to a separate binding-layer RFC which defines how this model is implemented in the current system.

---

## 14. Summary

This model enforces a single, verifiable lifecycle for all UI actions.

It ensures:
- deterministic execution
- explicit verification
- consistent failure handling
- unified observability
