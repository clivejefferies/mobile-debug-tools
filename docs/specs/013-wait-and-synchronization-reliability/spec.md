

# RFC 013 — Wait and Synchronization Reliability

## Status

Draft

---

# 1. Summary

This RFC introduces deterministic synchronization primitives and snapshot freshness semantics for mobile-debug-mcp.

The goal is to reduce premature action execution, stale-state reasoning, retry amplification, and sequencing instability when interacting with asynchronous mobile UI frameworks.

The RFC defines:

- UI synchronization principles
- Wait lifecycle semantics
- Snapshot freshness metadata
- Convergence and stabilization behavior
- Synchronization guardrails for agents
- Incremental synchronization foundations

These capabilities are intended to improve reliability across:

- Android Views
- Jetpack Compose
- UIKit
- SwiftUI

---

# Relationship to Existing Synchronization Contracts

This RFC extends and clarifies the synchronization semantics introduced in RFC003 and the currently shipped synchronization tooling.

RFC013 is additive rather than a full replacement.

Where conflicts exist between:

- historical documentation
- illustrative examples in earlier RFCs
- implementation behavior

The shipped implementation contract remains the source of truth until RFC013 reaches accepted status and corresponding implementation updates are merged.

This RFC specifically standardizes:

- synchronization terminology
- convergence semantics
- snapshot freshness semantics
- synchronization lifecycle behavior
- future incremental synchronization direction

It does not invalidate existing synchronization tooling.

---

# 2. Problem Statement

Current interaction flows rely heavily on immediate post-action reasoning against potentially transient UI state.

Observed failure modes include:

- Actions executing before navigation or recomposition completes
- Agents reasoning against stale hierarchy snapshots
- Retry loops caused by transient loading states
- Network activity incorrectly treated as readiness confirmation
- In-place UI mutations not being detected reliably
- Async Compose recomposition causing unstable interaction timing
- Sequential actions being executed without convergence verification

Example failure pattern:

```text
Tap login button
→ hierarchy partially updates
→ next action executes immediately
→ target element not yet available
→ retry loop begins
```

The current model does not provide a deterministic definition of:

- when the UI has changed
- when the UI is stable
- whether a snapshot is fresh
- whether synchronization has converged

This RFC introduces explicit synchronization semantics to address those gaps.

---

# 3. Goals

The system should:

- Make UI state transitions observable and waitable
- Reduce premature action execution
- Improve deterministic sequencing behavior
- Reduce retry amplification
- Support asynchronous UI frameworks reliably
- Improve snapshot freshness awareness
- Enable token-efficient synchronization strategies
- Provide explicit synchronization lifecycle semantics

---

# 4. Non-Goals

This RFC does not attempt to:

- Implement autonomous recovery planning
- Infer app-specific business loading semantics
- Guarantee backend or network completion
- Replace explicit verification primitives
- Eliminate all timing-related failures
- Perform animation introspection beyond observable hierarchy state
- Solve all synchronization issues at the protocol level alone

---

# 5. Design Principles

## 5.1 UI-First Synchronization

Observable UI convergence is the primary synchronization signal.

The system should prefer:

- hierarchy changes
- visibility changes
- enabled-state changes
- navigation transitions

over indirect signals such as:

- network activity
- logs
- timing assumptions

---

## 5.2 Verification Over Inference

Synchronization should confirm observable state transitions rather than infer readiness heuristically whenever possible.

Preferred flow:

```text
action
→ wait
→ verify
```

Avoid:

```text
action
→ immediate follow-up action
```

---

## 5.3 Bounded Convergence

All synchronization operations must terminate deterministically.

Every wait operation must:

- have a timeout
- expose completion reason
- avoid infinite polling loops
- expose partial convergence information when possible

---

## 5.4 Snapshot Freshness Awareness

Agents should understand whether observations are:

- current
- stale
- transient
- stable

Snapshot freshness must be explicit rather than inferred.

---

## 5.5 Explicit Sequencing

Synchronization should encourage predictable execution ordering.

Preferred execution model:

```text
perform action
→ observe mutation
→ wait for convergence
→ verify state
→ continue
```

---

# 6. Definitions

## Fresh

A snapshot is considered fresh when:

- its `snapshot_revision` matches the latest observed hierarchy revision
- its `captured_at_ms` timestamp is newer than the most recent qualifying hierarchy mutation observed by the synchronization operation

Freshness is computed by the synchronization subsystem.

Freshness is advisory rather than absolute because additional hierarchy mutation may occur immediately after snapshot capture.

---

## Stale

A snapshot is considered stale when:

- a newer hierarchy revision exists
- the synchronization subsystem has observed additional qualifying hierarchy mutation after the snapshot was captured

---

## Transient

A hierarchy state is transient when qualifying hierarchy mutations are still occurring within the stabilization window.

Transient state maps to:

```text
stability_state = transient
```

---

## Stable

A hierarchy state is stable when:

- no qualifying hierarchy mutations occur within the stabilization window
- convergence conditions have been satisfied

Stable state maps to:

```text
stability_state = stable
```

---

## Converged

A synchronization state in which:

- required conditions are satisfied
- no additional qualifying hierarchy mutations occur within the stabilization window
- the returned snapshot is considered fresh at the time of emission

---

# 7. Proposed Capabilities

## 7.1 wait_for_ui_change

Introduces an explicit synchronization primitive that waits for observable hierarchy mutation.

### Current Shipped Contract

The current implementation exposes synchronization through the interaction layer using:

```json
wait_for_ui_change({
  platform?: "android" | "ios",
  deviceId?: string,
  timeout_ms?: number,
  stability_window_ms?: number,
  expected_change?: string,
  scope?: "screen" | "subtree",
  target?: string
})
```

`scope=subtree` requires a target `element_id` and narrows synchronization to the resolved element subtree.

### Semantics

The operation:

1. Captures the current hierarchy revision
2. Waits for qualifying hierarchy mutation
3. Waits for stabilization convergence
4. Returns synchronization metadata

### Completion Conditions

The operation succeeds when:

- a qualifying hierarchy mutation occurs
- stabilization completes before timeout

The operation fails when:

- timeout expires
- hierarchy becomes unavailable
- target subtree becomes invalid

### Synchronization-Relevant Mutation Rules

The current implementation treats synchronization-relevant mutations as observable hierarchy changes that may affect interaction correctness or verification behavior.

Examples include:

- element addition or removal
- visibility changes
- enabled-state changes
- navigation transitions
- text or content-description changes
- subtree structure mutation
- semantic accessibility tree mutation

The implementation may ignore mutations considered non-meaningful for synchronization purposes.

Examples may include:

- animation frame updates
- layout-only jitter
- opacity-only visual transitions
- non-semantic rendering updates

Mutation qualification behavior is currently implementation-defined.

### Normative Default Mutation Classification Rules

The implementation MUST treat the following as synchronization-relevant mutations:

- element addition or removal
- visibility changes
- enabled-state changes
- navigation transitions
- text or content-description changes
- subtree structure mutation
- semantic accessibility tree mutation

The implementation MUST NOT treat the following as synchronization-relevant mutations:

- animation frame updates
- layout-only jitter
- opacity-only visual transitions
- non-semantic rendering updates

If a mutation affects interaction semantics or element accessibility identity, it SHOULD be treated as synchronization-relevant.

Future protocol revisions may standardize semantic diff classification.

### Response Example

```json
{
  "status": "success",
  "snapshot_revision": 42,
  "change_detected": true,
  "stabilized": true,
  "elapsed_ms": 842
}
```

### Normative Field Definitions

| Field | Status | Description |
|---|---|---|
| `platform` | optional | Target platform identifier |
| `deviceId` | optional | Device session identifier |
| `timeout_ms` | optional | Maximum synchronization duration |
| `stability_window_ms` | optional | Required stabilization duration before convergence |
| `expected_change` | optional | Advisory description of expected UI mutation |
| `scope` | proposed | Future subtree or screen scoping |
| `target` | proposed | Future scoped synchronization target |

---

## 7.1.1 Stabilization Execution Model (Normative)

This section defines the required execution semantics for stabilization. Implementations MAY differ internally, but MUST conform to the observable behavior defined here.

### 1. Core Rule

Stabilization is defined as:

> a continuous period of `stability_window_ms` during which no synchronization-relevant mutation occurs.

A snapshot is considered **stable only when this condition is satisfied continuously for the full window duration**.

---

### 2. Window Behavior (Reset Semantics)

The stabilization window:

- MUST reset whenever a synchronization-relevant mutation is observed
- MUST be measured from the **most recent qualifying mutation timestamp**

This implies:

```text
mutation → reset window → wait full window → check again
```

There is no accumulation of partial stability.

---

### 3. Coalescing Model

Multiple mutations occurring within the stabilization window:

- MUST be treated as a single continuous instability period
- MUST NOT trigger separate stabilization evaluations

Effectively:

> stabilization evaluates *quiescence*, not individual events

---

### 4. Completion Condition

Stabilization is complete only when:

- no synchronization-relevant mutation has occurred for a full `stability_window_ms`
- at least one snapshot is captured at the end of that window without new mutation

This guarantees convergence is based on observed inactivity, not prediction.

---

### 5. Emission Semantics

Implementations:

- MAY emit intermediate “transient” or “stabilizing” states internally
- MUST NOT report `stable` until the completion condition is satisfied
- MUST ensure `stable` implies a fully satisfied stabilization window

---

### 6. Timeout Interaction

If a timeout occurs:

- stabilization MUST abort
- partial convergence MUST NOT be reported as `stable`
- last observed state MAY be returned with `stabilizing` or equivalent status

---

### 7. Determinism Requirement

Given identical sequences of:

- mutations
- timing
- `stability_window_ms`

the stabilization outcome MUST be deterministic.

---

## 7.2 Snapshot Revision Metadata

Snapshots should expose explicit freshness metadata.

Example:

```json
{
  "snapshot_revision": 42,
  "captured_at_ms": 1716738123,
  "loading_state": {
    "active": false,
    "signal": "none",
    "source": "system"
  }
}
```

### Current Shipped Metadata

The current implementation exposes:

 - `snapshot_revision`
 - `captured_at_ms`
 - advisory `loading_state`
 - `scope` and `target` on wait responses
 - `stability_state` and scoped `change_summary` on wait responses

The `loading_state` field is currently an advisory structured object rather than a simple enum value.

Wait responses also include a `snapshot_freshness_ms` age value so callers can reason about freshness without inferring it from revision numbers alone.

### Requirements

- revisions must be monotonically increasing
- revisions must increment on qualifying hierarchy mutation
- stale snapshots must be detectable
- stability state must be explicit

### Proposed Stability States

The shipped implementation emits `transient` while a wait is still converging and `stable` once the stabilization window has completed.

---

## 7.3 Loading State Detection

The system should expose structured loading semantics when observable.

Examples:

- progress indicators
- loading spinners
- disabled submission states
- visible loading overlays
- navigation transition indicators

### Important Constraint

Loading detection is advisory.

It must not be treated as authoritative proof of application readiness.

UI convergence remains the primary synchronization signal.

---

## 7.4 Focused Snapshot Scoping

Large hierarchies create latency and token-efficiency problems.

The protocol should support scoped synchronization.

Examples:

- subtree snapshots
- target-local snapshots
- focused diff regions

### Goals

- reduce payload size
- reduce reasoning complexity
- improve synchronization latency
- improve Compose hierarchy handling

The shipped runtime exposes scope-aware waits and snapshot delta summaries on UI tree and debug snapshot responses to keep this signal lightweight.

---

## 7.5 Incremental Snapshot Delivery

The protocol should support incremental hierarchy updates.

Example capabilities:

- structural diffs
- subtree invalidation
- partial hierarchy refreshes
- revision patch delivery

The shipped runtime currently exposes revision-aware `snapshot_delta` metadata rather than transport-level patch payloads.

### Dependency

Incremental synchronization depends on stable element identity semantics.

This capability therefore depends on the richer element identity RFC.

---

# 8. Synchronization Lifecycle Model

Synchronization should follow a consistent lifecycle.

```text
Action Executed
    ↓
Transient UI Mutation
    ↓
Hierarchy Revision Changes
    ↓
Optional Loading State
    ↓
Convergence Detection
    ↓
Stable Snapshot Available
    ↓
Verification Phase
```

This lifecycle is intended to standardize synchronization expectations across tools and agents.

---

# 9. Agent Guidance and Guardrails

## Preferred Flow

```text
perform_action
→ wait_for_ui_change
→ verify_expected_state
```

---

## Avoid

```text
perform_action
→ immediate_follow_up_action
```

---

## Network and Log Signals

Network activity and logs may be used for diagnostics.

They should not be treated as primary synchronization signals unless explicitly required for a workflow.

---

## Retry Behavior

Retries should occur only after:

- synchronization failure
- verification failure
- explicit timeout

Retries should not replace synchronization primitives.

---

# 10. Failure Modes

## Infinite Animations

Continuous animations may prevent convergence.

Mitigation:

- scoped synchronization
- stabilization thresholds
- ignore-list heuristics

---

## Background Recomposition Churn

Compose and SwiftUI may produce frequent transient hierarchy mutations.

Mitigation:

- stabilization windows
- semantic diff filtering
- subtree scoping

---

## Ephemeral UI Elements

Examples:

- toasts
- snackbars
- temporary overlays

Mitigation:

- bounded stabilization windows
- semantic significance filtering

---

## Delayed Navigation Transitions

Navigation may begin after asynchronous work.

Mitigation:

- longer synchronization windows
- explicit verification after wait completion

---

## Stale Cached Snapshots

Agents may reason against outdated hierarchy state.

Mitigation:

- explicit revision metadata
- freshness checks
- revision-aware synchronization

---

# 11. Platform Considerations

## Android Views

Traditional view hierarchies are comparatively stable but may still experience delayed transitions and asynchronous rendering.

---

## Jetpack Compose

Compose introduces:

- recomposition churn
- transient hierarchy instability
- frequent semantic tree mutation

Compose synchronization should prefer:

- semantic stability
- subtree scoping
- stabilization windows

---

## UIKit

UIKit transitions are generally deterministic but may include animation timing gaps.

Synchronization should prioritize observable hierarchy completion rather than transition timing assumptions.

---

## SwiftUI

SwiftUI shares several synchronization challenges with Compose:

- transient updates
- declarative rendering churn
- delayed state propagation

Stabilization windows are especially important.

---

# 12. Telemetry and Metrics

The implementation should track:

- synchronization success rate
- premature action reduction
- retry reduction rate
- stale snapshot detection frequency
- average stabilization duration
- hierarchy diff frequency
- synchronization timeout frequency

These metrics should be used to tune convergence heuristics.

---

# 13. Rollout Strategy

## Phase 1

Introduce:

- snapshot revision metadata
- basic wait_for_ui_change
- stabilization windows

---

## Phase 2

Introduce:

- loading state detection
- convergence heuristics
- scoped synchronization

---

## Phase 3

Introduce:

- incremental snapshot delivery
- diff-based synchronization
- subtree invalidation

The runtime now exposes scoped diff summaries for waits, but full partial-hierarchy patch delivery remains a future protocol extension.

---

## Phase 4

Introduce:

- advanced convergence tuning
- platform-specific optimization
- adaptive stabilization heuristics

---

# 14. Design Closure

This specification is fully defined and implementation-ready.

All previously listed open questions have been resolved within normative sections 7.x and 7.1.1.

No runtime behavior is delegated to interpretation.

Future changes require a new RFC or explicit versioned amendment.

The following areas are fully specified:

- implicit vs explicit execution model (explicit only)
- mutation classification (normative rules defined in 7.1)
- stabilization semantics (7.1.1)
- diff semantics (structural + semantic accessibility only)
- default synchronization scope (screen)

# 15. Dependencies

## Depends On

- Stronger State Verification
- Richer Element Identity

---

## Strengthens

- Actionability Resolution
- Compose and Custom Control Semantics
- Incremental Snapshot Systems
- Advanced Trace Correlation
- Retry Reduction Initiatives

---

# 16. Conclusion

Reliable synchronization is foundational to deterministic mobile automation.

This RFC introduces explicit synchronization semantics that:

- reduce premature execution
- improve snapshot freshness awareness
- provide deterministic convergence behavior
- establish consistent sequencing expectations
- create a foundation for incremental synchronization capabilities

These changes are intended to improve reliability, reduce retries, and make agent behavior substantially more predictable across asynchronous mobile UI frameworks.
