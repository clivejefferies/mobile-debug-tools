# RFC 007 — Actionability Resolution and Executable Target Selection

## 1. Summary

This RFC defines how the system resolves which discovered UI element should receive an action before dispatch.

It addresses ambiguity between:
- visible elements vs actionable elements
- leaf nodes vs clickable containers
- semantic targets vs coordinate fallbacks
- multiple candidate targets with uncertain executability

Goal:
Improve first-attempt action correctness by resolving the best executable target prior to action dispatch.

This RFC defines the `Resolved` stage semantics referenced in RFC 005 and operationalized by RFC 006.
It is grounded in the existing element-resolution flow and extends current resolution behavior rather than assuming a wholly new resolver architecture.

---

## 2. Problem Statement

Current interaction failures often arise before execution.

The agent may discover the intended UI concept, but not the correct executable target.

Examples:
- tapping label text instead of clickable container
- sliders not surfacing semantic handles
- generic Compose containers hiding true affordances
- multiple matching targets without ranking logic

Observed failure modes:
- false taps
- submit ambiguity
- coordinate guessing
- retry loops
- brittle fallback behavior

This is a target-resolution problem, not an execution problem.

---

## 3. Design Goals

Resolution MUST:
- Prefer executable targets over merely visible matches
- Reduce ambiguous target selection
- Support confidence-based ranking
- Build on existing runtime resolution surfaces before introducing new resolution metadata
- Use structural and semantic resolution signals
- Minimize coordinate fallback usage
- Integrate with verification expectations from RFC 005

---

## 4. Actionability Model

Candidate targets are evaluated using actionability signals.

### Structural signals
- clickable
- enabled
- focusable
- bounds
- parent action ownership

### Semantic signals
- control role
- label association
- affordance hints
- selectable or adjustable semantics

### Interaction signals
- reliable target patterns
- control-specific heuristics
- gesture compatibility

---

## 4.1 Current Runtime Resolution Surfaces

This RFC builds on current runtime resolution paths, including:
- `findElementHandler` for candidate discovery
- `_resolveActionableAncestor` for executable ancestor promotion
- `tapElementHandler` for resolved element dispatch
- `scrollToElementHandler` for scroll-mediated target acquisition

These existing handlers are the current implementation substrate for the Resolved stage.
This RFC extends and systematizes those behaviors; it does not assume replacement of those paths.

---

## 5. Target Candidate Ranking

When multiple targets match, candidates are ranked.

Illustrative confidence model:

resolution_confidence =
 interactability_score
 + semantic_match_score
 + structural_reliability_score

Highest-confidence executable target is preferred.

The confidence model is illustrative and normative only at the rule-precedence level; implementations may use simpler heuristics while preserving resolution ordering guarantees. Any scoring mechanism is implementation-defined and may not be externally surfaced.

---

## 6. Resolution Rules

### Rule A — Prefer actionable containers over passive leaf nodes

Prefer:
- clickable container

Over:
- passive child text nodes

Example:
Prefer button container over "Generate Session" label node.

---

### Rule B — Prefer semantic controls over coordinate fallbacks

Use semantic control targets whenever possible.

Coordinate fallback only when:
- no semantic target exists
- adjustable control semantics absent
- fallback confidence acceptable

---

### Rule C — Prefer explicit affordance ownership

If child and parent differ:
prefer the node owning the action handler.

---

## 7. Ambiguity Handling

When multiple plausible targets remain:

System SHOULD:
- rank candidates
- expose confidence
- preserve alternates for fallback reasoning

Low-confidence targets may trigger:
- guarded execution
- alternate resolution attempt
- explicit recovery path

---

## 8. Adjustable Control Resolution

Special handling for:
- sliders
- steppers
- drag controls

Support:
- adjustable-role recognition
- control-bound discovery
- value-aware interaction targeting

This RFC defines target resolution.
Value-setting behavior remains governed by Adjustable Control Support.

---

## 9. Compose / Custom Control Resolution

Support derived actionability for:
- merged Compose semantics
- composite controls
- inferred interaction contracts

This RFC depends on and strengthens Better Compose / Custom Control Semantics.

---

## 10. Resolution Output Model (Current + Future Extension)

This model is non-normative and represents a progressive enrichment direction rather than a required runtime contract.

Resolution may evolve toward the following enriched output shape. Current runtime implementations may expose only resolved-target output plus limited supporting metadata.

At minimum, current implementations are expected to produce a resolved target. Confidence, alternates, fallback metadata, and reason codes may be introduced incrementally.

Illustrative future-complete shape:

{
  "resolved_target": "...",
  "confidence": 0.92,
  "fallback_available": true,
  "resolution_reason": "clickable_parent_preferred"
}

---

## 11. Verification Integration

Resolution is incomplete without verification expectations.

Resolved output should be derived directly from the existing element-resolution flow before adding richer metadata layers.

Resolved target should carry expected post-action signal.

Examples:
- navigation transition expected
- menu expected
- control value change expected

This feeds RFC 005 verification.

---

## 12. Success Metrics

Track:
- reduced false-tap failures
- lower retarget retries
- higher first-attempt action success
- reduced coordinate fallback usage
- improved custom control interaction success

---

## 13. Dependencies

Depends on:
- Stronger State Verification
- Richer Element Identity
- Wait and Synchronization Reliability

Strengthens:
- Adjustable Control Support
- Better Compose / Custom Control Semantics

---

## 14. Relationship to Other RFCs

RFC 005
Defines what Resolved means in lifecycle semantics.

RFC 006
Defines how runtime interprets action execution.

RFC 007
Defines how a target becomes Resolved.
Specifically, it formalizes the current discovery → actionable ancestor resolution → dispatch preparation flow already present in runtime handlers.

Together:
- RFC 005 — action correctness
- RFC 006 — runtime execution binding
- RFC 007 — executable target resolution

---

## 15. Summary

This RFC reduces failures caused by acting on the wrong thing, even when the right thing was discovered.

It improves:
- action precision
- control reliability
- Compose interaction robustness
- agent success with fewer retries

It addresses one of the largest remaining sources of interaction brittleness.