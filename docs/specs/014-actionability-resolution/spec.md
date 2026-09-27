# RFC 014 — Actionability Resolution

## Status

Draft

---

# 1. Summary

This RFC defines a deterministic model for resolving whether a UI element is actionable within mobile-debug-mcp.

Actionability Resolution ensures that interactions (tap, input, scroll targets, gestures) are only executed against elements that are in a valid and stable state for interaction.

It builds directly on:

- RFC 013 (Wait and Synchronization Reliability)
- Stronger State Verification primitives
- Richer Element Identity model

---

# 2. Relationship to Existing Resolution System (RFC 005 / RFC 007)

This RFC refines, but does not replace, the existing resolution pipeline defined in RFC 005 (Resolved Stage) and RFC 007 (Executable Target Selection).

Specifically:

- RFC 005 defines when an element is considered a valid resolved target
- RFC 007 defines how executable targets are selected from candidate elements
- RFC 014 defines a **pre-execution predicate gate**: whether a resolved target is safe to interact with at dispatch time

RFC 014 MUST be applied AFTER RFC 005/007 resolution and BEFORE any interaction dispatch occurs.

---

# 3. Problem Statement

Current interaction failures arise when actions are attempted on elements that are:

- not yet fully rendered
- temporarily disabled during recomposition
- visually present but not interactable due to transient platform state (composition, layout, or interaction eligibility changes)
- stale due to snapshot timing issues

This leads to:

- missed taps
- retry loops
- inconsistent automation outcomes
- non-deterministic test behavior

There is currently no single authoritative model defining when an element is safe to interact with.

---

# 4. Goals

The system should:

- Provide a deterministic definition of "actionable"
- Prevent interactions on unstable UI states
- Reduce retries caused by transient UI conditions
- Integrate with stabilization semantics from RFC 013
- Support both Android and iOS UI models

---

# 5. Non-Goals

This RFC does NOT:

- define gesture recognition internals
- implement visual computer vision occlusion detection
- guarantee backend readiness
- replace synchronization primitives from RFC 013
- define visual occlusion detection; interaction eligibility is derived from platform clickable/interactable semantics, not vision-based inference

---

# 6. Definition: Actionability

An element is considered **actionable** if ALL of the following conditions are satisfied:

## 6.1 Structural Validity

- Element exists in the current UI hierarchy snapshot
- Element identity is stable (per Richer Element Identity model)

### Identity Source of Truth

Element identity MUST be derived using the following priority order:

1. `stable_id` (primary source from runtime)
2. `elementId` deterministic hash (fallback)
3. recomputed semantic node signature (last resort)

If identity cannot be resolved consistently across snapshots, the element MUST be treated as non-actionable due to instability.

## 6.2 Visibility

- Element is visible within the current viewport OR scrollable container
- Element is not explicitly hidden (e.g. visibility = gone / hidden)

## 6.3 Enabled State

- Element is not disabled
- Element accepts interaction for the requested action type
- Must be interpreted relative to action_type (see Section 7.4)

## 6.4 Stability Requirement

- UI must be in a "stable" state per RFC 013 stabilization rules
- No synchronization-relevant mutation is currently active

## 6.5 Interaction Eligibility

- Element is not in a transitional animation state that blocks interaction
- Element is not temporarily detached or reparenting in the hierarchy
- Element MUST satisfy runtime proxy interactability derived only from visible, enabled, and clickable fields
- No hit-test, overlay, or occlusion guarantees are assumed

---

# 7. Actionability Evaluation Model (Runtime Contract)

Actionability is evaluated using runtime-provided fields from the resolved element and snapshot system.

## 7.1 Predicate Definition

```text
is_actionable(element, snapshot, normalized_action_type) =
  exists(element)
  AND snapshot.stable == true
  AND element.visible == true
  AND element.enabled == true
  AND normalized_action_type IS NOT NULL
  AND actionability_by_type(normalized_action_type, element)
  AND identity_is_stable(element)
```

## 7.2 Field Mapping

| Predicate Component | Source Field |
|--------------------|-------------|
| exists(element) | element presence in resolved tree |
| snapshot.stable | RFC 013 stabilization state |
| element.visible | visible / computed visibility flag |
| element.enabled | enabled / interactable flag |
| actionability_by_type(action_type, element) | derived runtime interaction capability from visible, enabled, clickable proxy signals (no hit-test dependency) |
| identity_is_stable | stable_id or fallback identity resolution |

## 7.3 Identity Stability Rule

Identity is considered stable if `stable_id` remains unchanged across the latest two snapshots.

If identity changes, the element MUST be re-resolved before actionability can be evaluated.

## 7.4 Action Type Applicability (Core Contract)

Action type is a PRIMARY dimension of actionability and MUST be evaluated explicitly for every interaction.

The predicate `actionability_by_type(action_type, element)` is not optional and defines interaction correctness.

If the caller omits `action_type`, implementations MUST evaluate Tap / Click semantics.
Before evaluation, implementations MUST normalize the effective action type to a concrete value.

Each action type defines strict eligibility constraints:

### Tap / Click (Default Interaction Model)
- Requires: element.clickable == true
- Requires: element.visible == true
- Requires: element.enabled == true
- This is the DEFAULT action model when action_type is unspecified

### Input / Text Entry
- Requires: element.enabled == true
- Requires: element.focusable == true OR platform equivalent input capability
- Clickable is NOT required

### Scroll Targeting
- Requires: element is within a scrollable container
- Requires: element.visible == true OR can be brought into viewport
- Enabled state is NOT required

### Gesture (Swipe / Drag)
- Requires: element exists in stable snapshot
- Requires: element.visible == true
- Requires: no active animation or transition state that blocks interaction

### Contract Rule

Implementations MUST treat the effective action type as a required discriminator in all actionability evaluations.

### Determinism Rule

Action type evaluation is fully deterministic.

All constraints for a given action type MUST be evaluated as a single conjunctive predicate.

No constraint MAY override another constraint. No priority ordering between fields is permitted.

Evaluation MUST produce identical results for identical inputs (element, snapshot, action_type).

## 7.5 Deterministic Evaluation Guarantees

Actionability evaluation is a pure function of:

- element
- snapshot
- action_type

The evaluation MUST NOT depend on external or hidden state.

The system MUST guarantee:

- identical inputs produce identical outputs
- no temporal or execution-order dependency affects results
- all predicates are evaluated in a single logical context

Short-circuit evaluation is permitted for performance but MUST NOT change final outcome semantics.

---

# 8. Resolution Lifecycle

Actionability MUST be evaluated in the following sequence:

1. Retrieve latest UI snapshot
2. Verify snapshot is stable (RFC 013)
3. Resolve element identity
4. Evaluate visibility constraints
5. Evaluate enabled state
6. Evaluate interaction readiness
7. Return final boolean result

If any step fails, the element MUST be considered non-actionable.

---

# 9. Interaction Guardrail

Actions MUST NOT be executed unless actionability resolution returns true.

If actionability is false:

- system MAY retry after waiting for stabilization
- system MUST NOT force interaction
- system MAY re-resolve snapshot

---

# 10. Failure Modes

## 10.1 Transient Non-Actionability

Caused by:

- recomposition
- animation transitions
- delayed rendering

Mitigation:

- rely on RFC 013 stabilization
- re-evaluate after wait cycle

---

## 10.2 Stale Snapshot

Caused by:

- outdated hierarchy
- missed mutation events

Mitigation:

- require fresh snapshot before evaluation

---

## 10.3 False Positives (appears actionable but is not)

Caused by:

- proxy signal mismatch (e.g. element reports clickable/visible but runtime rejects interaction via proxy constraints)

Mitigation:

- stricter validation of visible/enabled/clickable proxy consistency
- re-resolution of element state before evaluation

---

# 11. Platform Considerations

## Android

- View visibility and enabled-state are primary signals
- Touch target bounds SHOULD be respected

## iOS

- UIKit and SwiftUI state transitions may delay interaction readiness
- Accessibility tree is primary signal for actionability

---

# 12. Integration with RFC 013

Actionability Resolution depends on:

- Stable snapshot guarantee
- Synchronization-relevant mutation rules

It MUST NOT evaluate elements from unstable snapshots.

---

# 13. Telemetry

Systems SHOULD track:

- actionability rejection rate
- retry frequency after failed actionability
- time-to-actionable per element
- false-positive interaction attempts

---

# 14. Rollout Strategy

## Phase 1

- Basic structural + visibility checks

## Phase 2

- Stability integration (RFC 013)

## Phase 3

- Platform-specific interaction heuristics

The shipped interaction layer now applies iOS semantic tap eligibility in addition to proxy clickability checks.

---

# 15. Dependencies

## Depends On

- RFC 013 — Wait and Synchronization Reliability
- Stronger State Verification
- Richer Element Identity

---

# 15.1 Acceptance Criteria

An implementation of RFC 014 is considered correct if:

- Disabled elements never pass actionability checks
- Elements in unstable snapshots are never actionable
- Identity changes force re-resolution before interaction
- Proxy interaction eligibility blocked elements are rejected
- All failures produce a defined failure code
- Actionability is only evaluated AFTER RFC 005/007 resolution

# 16. Failure Codes (Actionability Gate)

## Failure Code Derivation Matrix

Failure codes MUST be derived directly from predicate evaluation results:

| Predicate Failure Condition | Failure Code |
|----------------------------|-------------|
| element does not exist in snapshot | NOT_FOUND |
| element.visible == false | NOT_VISIBLE |
| element.enabled == false | NOT_ENABLED |
| snapshot.stable == false | NOT_STABLE |
| identity_is_stable == false | IDENTITY_UNSTABLE |
| actionability_by_type(...) == false | NOT_ELIGIBLE |

These are the only supported actionability failure codes.

Implementations SHOULD return the structured code together with a human-readable reason.

# 17. Conclusion

Actionability Resolution provides the final gate before UI interaction execution.

It ensures that all interactions are performed only on elements that are structurally valid, stable, visible, and interaction-ready, significantly reducing non-deterministic automation behavior.
