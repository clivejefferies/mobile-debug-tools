


# RFC 008 — Adjustable Control Support and Semantic Value Manipulation

## 1. Summary

This RFC defines semantic interaction support for adjustable controls whose primary interaction changes a value rather than triggering a discrete action.

Examples include:
- sliders
- steppers
- seek bars
- drag-based range controls
- quantized parameter selectors

Goal:
Enable reliable value-setting interactions with verification, minimizing coordinate guessing and brittle gesture calibration.

Builds on:
- RFC 005 — correctness model
- RFC 006 — runtime execution binding
- RFC 007 — target resolution

---

## 2. Problem Statement

Current control adjustment often degrades into coordinate heuristics.

Observed failure modes:
- slider handles not semantically surfaced
- coordinate calibration guesswork
- snapping or quantized values behaving unexpectedly
- weak confirmation of resulting value
- retries caused by partial adjustment success

This is not primarily a gesture problem.

It is:
- a control semantics problem
- a value verification problem
- an adjustment convergence problem

---

## 3. Design Goals

Support MUST:
- Prefer semantic adjustment over coordinate manipulation
- Support deterministic value targeting
- Verify resulting value after adjustment
- Handle quantized or snapping controls
- Support bounded tolerance when exact values are impossible
- Use coordinate fallback only as degraded mode

---

## 4. Adjustable Control Model

Treat adjustable controls as a combination of:
- target control
- value model
- adjustment mechanism
- verification loop

Control should expose where possible:
- current value
- minimum and maximum range
- step granularity (if known)
- adjustable role metadata

---

## 5. Primary Primitive

Illustrative adjustment primitive (conceptual, not yet a committed tool surface):

set_slider_value(target, value, tolerance?)

This denotes an adjustment capability, not a required standalone tool API. Implementations may realize it as:
- an extension of existing gesture tools
- an internal adjustment helper
- a future dedicated control-adjustment tool surface

This RFC does not mandate which mechanism is used.

Semantics:
- resolve control target
- perform adjustment
- read back resulting value
- converge or fail explicitly

This is not:
blind drag gestures

It is:
set and verify

## 5.1 Tool Surface Boundary

This RFC specifies adjustment semantics, not a committed tool API.

It does not assume a new public tool is introduced in this RFC.
Implementation may extend existing gesture/runtime surfaces before introducing any dedicated adjustment command.

---

## 6. Adjustment Modes

### Semantic mode (preferred)
Use control semantics to set value directly or intelligently drive adjustment.

---

### Gesture-assisted mode
Use controlled drag informed by:
- bounds
- target percentage
- snapping model

---

### Coordinate fallback (last resort)
Allowed only when semantic control support is absent.

Must be explicit degraded mode.

---

## 7. Verification Loop

Adjustment is incomplete until verified.

Loop:
- adjust
- read back
- compare to target or tolerance
- converge or fail after bounded retries

Possible outcomes:
- Verified
- Tolerance satisfied
- Failed to converge

Aligns with RFC 005.
Verification may initially be realized through explicit expect_state mappings for control value assertions. Dedicated value verifiers are a possible future extension, not a prerequisite of this RFC.

---

## 8. Quantized / Snapping Controls

Support:
- discrete step controls
- snapping values
- non-linear scales (where detectable)

Tolerance model required.

Example:
Target 30
Actual 29.8
Within tolerance acceptable
Discrete or non-numeric controls may satisfy convergence through semantic state equivalence rather than numeric tolerance alone.

---

## 9. Control Resolution Dependency

Uses RFC 007 target resolution for:
- locating actual adjustable control
- avoiding fake slider containers
- resolving executable adjustable target

RFC 007 resolves what to adjust.
RFC 008 defines how to adjust it.

---

## 10. Compose / Custom Control Support

Support derived adjustable semantics for:
- Compose sliders
- custom parameter widgets
- composite adjustable controls

Strengthens Better Compose / Custom Control Semantics.

---

## 11. Output / Result Model (Illustrative)

Illustrative result shape:

{
  "target_state": 30,
  "actual_state": 30,
  "converged": true,
  "adjustment_mode": "semantic"
}

State may be numeric, discrete, or semantic depending on control type. This model is illustrative and current implementations may expose only a subset through existing verification surfaces.

---

## 12. Success Metrics

Track:
- reduction in coordinate fallback usage
- reduced retries adjusting controls
- improved first-pass value convergence
- improved custom control adjustment success

---

## 13. Dependencies

Depends on:
- Stronger State Verification
- Actionability Resolution (RFC 007)

Strengthens:
- Better Compose / Custom Control Semantics
- Pinch to Zoom (future)

---

## 14. Relationship to Prior RFCs

RFC 005
Defines successful adjustment verification.

RFC 006
Defines runtime execution interpretation.

RFC 007
Defines which adjustable target gets selected.

RFC 008
Defines how value-changing controls are manipulated reliably.

Together:
- RFC 005 — correctness
- RFC 006 — runtime binding
- RFC 007 — target resolution
- RFC 008 — value manipulation

---

## 15. Summary

This RFC moves adjustable controls from:
- gesture guesswork

to:
- semantic value manipulation with verification

It reduces one of the largest remaining sources of interaction brittleness.

---

## 16. Non-Goals / Scope Boundary

This RFC defines adjustment semantics and convergence behavior.

It does not commit in this RFC to:
- a specific runtime tool API
- full adjustable control support across all control types
- generalized gesture framework support
- arbitrary drag or canvas manipulation
- pinch-to-zoom or broader gesture semantics

This RFC specifies the behavioral model adjustable-control support should satisfy as implementations mature.