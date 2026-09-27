# RFC 009 — Semantic Control Modeling for Custom and Composite Controls

## 1. Summary

This RFC defines a semantic control model for identifying, exposing, and interacting with custom and composite controls that are poorly represented through raw accessibility or platform UI trees.

It introduces semantic enrichment for controls such as:

- sliders
- steppers
- segmented controls
- dropdowns
- Compose/SwiftUI custom widgets
- composite gesture-driven controls

The goal is to improve target resolution, control interaction, and verification reliability for controls whose actionable semantics are not fully captured by raw snapshots.

---

## 2. Problem Statement

Current interaction logic works well when platform semantics are explicit.

It is weaker when controls appear as:

- generic container views
- unlabeled clickable wrappers
- nested composite controls
- custom Compose/SwiftUI components with weak accessibility exposure

Observed problems include:

- controls resolving as parent containers rather than actionable targets
- missing slider-like controls in snapshots
- weak distinction between discrete vs continuous controls
- inability to infer supported interactions from control structure
- unreliable verification of control state

This causes brittle automation and coordinate fallback behavior.

---

## 3. Goals

This RFC introduces a semantic layer that MUST:

- infer higher-level control semantics from raw UI structures
- enrich snapshots with semantic control metadata
- improve actionable target selection (RFC 007)
- improve adjustable control handling (RFC 008)
- improve verification for semantic control state
- reduce coordinate fallback usage

---

## 4. Non-Goals

This RFC does NOT define:

- replacement of raw accessibility trees
- ML-based semantic inference
- probabilistic control classification
- new gesture primitives
- autonomous planning behavior

Semantic modeling is deterministic enrichment layered over raw signals.

---

## 5. Runtime Surfaces

This RFC applies to existing runtime surfaces:

- findElementHandler
- _resolveActionableAncestor
- _buildResolvedElement
- tapElementHandler
- scrollToElementHandler

Semantic modeling augments these surfaces; it does not replace them.

---

## 6. Semantic Control Model

Controls MAY progressively expose semantic metadata such as:

```ts
interface SemanticControl {
  semantic_role:
    | "slider"
    | "stepper"
    | "dropdown"
    | "segmented_control"
    | "custom_adjustable"
    | "composite_control";

  supported_actions: string[];

  adjustable: boolean;

  state_shape:
    | "continuous"
    | "discrete"
    | "semantic";
}
```

The control roles above represent an expected semantic model, not a claim that all such control classes are equally surfaced in the current runtime.

Current runtime support may initially expose simpler semantic signals such as:
- role hints
- semantic labels
- value_range metadata
- selector confidence or related resolution signals

Richer control roles are progressive extensions over time.

---

## 7. Semantic Inference Rules

Inference MAY use signals such as:

- accessibility role hints
- value_range metadata
- child composition patterns
- repeated selectable child structures
- platform traits (adjustable, selected, expanded)
- known control heuristics

Inference MUST be deterministic and explainable.

Raw signals always win on conflict.

Semantic inference confidence, where present, is advisory only and MUST NOT be treated as executable truth.

---

## 8. Resolution Integration (RFC 007)

Semantic metadata SHOULD improve target resolution by:

- preferring actionable child controls over generic containers
- promoting semantically actionable descendants
- disambiguating among multiple candidate matches

Semantic signals are advisory enrichment, not executable truth.

---

## 9. Adjustable Control Integration (RFC 008)

Where adjustable=true:

Semantic metadata MAY expose:

- supported adjustment mode
- discrete vs continuous state model
- expected verification strategy

This improves convergence for value-setting workflows.

---

## 10. Verification Integration

Verification MAY use semantic control metadata to improve:

- value-state verification
- discrete selection verification
- semantic-state checks

Formal verification still remains governed by RFC 005.

---

## 11. Output Contract (Progressive Extension)

Current runtime may expose partial semantic outputs.

Expected progressive shape (future extension model):

```ts
interface SemanticResolutionMetadata {
  semantic_role?: string;
  supported_actions?: string[];
  adjustable?: boolean;
  state_shape?: string;
  confidence?: "low" | "medium" | "high";
}
```

These fields are progressive enrichment and MUST NOT be assumed universally present.

Implementations MAY expose only a subset of this model initially. Presence of a richer semantic role does not imply universal runtime support for all control classes.

---

## 12. Failure Modes

Semantic modeling MAY fail due to:

- insufficient raw signals
- ambiguous composite structures
- conflicting heuristics

When semantic inference confidence is insufficient:

- raw resolution flow MUST continue
- semantic fields MAY be omitted
- no semantic guessing should be forced

---

## 13. Success Metrics

- fewer coordinate fallbacks
- improved control discovery
- improved actionable-target precision
- improved slider/custom-control automation success
- reduced semantic mismatch failures (RFC 010)

---

## 14. Relationship to Other RFCs

RFC 005 — verification correctness model
RFC 006 — runtime action execution
RFC 007 — target resolution
RFC 008 — adjustable control support
RFC 010 — recovery uses semantic mismatch failures defined here

---

## 15. Summary

This RFC adds deterministic semantic control enrichment for custom and composite controls, improving resolution, interaction reliability, and verification while remaining layered over existing runtime signals.
