# Spec: Adjustable Control Support

## Purpose

Provide a deterministic, semantic interface for interacting with adjustable controls (such as sliders, steppers and other value-based controls) without relying primarily on coordinate manipulation.

The goal is to allow agents to request a target value rather than perform low-level gestures while ensuring deterministic convergence through runtime verification.

---

# Rationale

Adjustable controls are common throughout modern mobile applications, but they remain one of the least reliable interaction types for autonomous agents.

Current interaction typically depends on coordinate dragging, which is affected by:

- varying control sizes
- snapping behaviour
- quantised values
- custom widget implementations
- accessibility differences
- platform-specific gesture handling

This specification introduces a semantic adjustment model where agents request the desired value rather than the physical gesture required to achieve it.

---

# Goals

The implementation shall:

- Prefer semantic adjustment over gesture simulation.
- Read the current control state before adjustment where possible.
- Determine the most appropriate adjustment strategy.
- Converge deterministically toward the requested value.
- Verify the resulting value after every adjustment.
- Return deterministic failures when convergence cannot be achieved.

---

# Non-Goals

This specification does not:

- Improve gesture precision (covered by **Adjustable Control Precision Hardening**).
- Introduce new gesture types.
- Implement visual inference of control state.
- Replace coordinate interaction for unsupported controls.
- Introduce adaptive or heuristic convergence strategies beyond deterministic bounded attempts.

---

# Supported Controls

Initial scope includes:

- Sliders
- Seek bars
- Steppers
- Rating controls
- Adjustable Compose controls
- Adjustable UIKit / SwiftUI controls
- Accessibility-adjustable controls

All supported controls must expose or deterministically parse into a numeric value domain. Non-numeric adjustable properties are outside the initial scope.

---

# Runtime Interface

The public tool contract remains the existing `adjust_control` operation.

```text
adjust_control(
    selector?,
    element_id?,
    property,
    targetValue,
    tolerance?,
    maxAttempts?
)
```

Exactly one of `selector` or `element_id` must be supplied.

## Parameters

| Parameter | Description |
|----------|-------------|
| selector | Selector used by the existing element resolution pipeline |
| element_id | Previously resolved runtime element identifier |
| property | Adjustable property to modify, initially limited to numeric value properties |
| targetValue | Requested logical numeric value in the normalized domain defined by this specification |
| tolerance | Optional acceptable absolute error in the same normalized domain as `targetValue` |
| maxAttempts | Optional positive integer limiting bounded adjustment and verification attempts |

The internal execution operation may be represented as:

```text
set_adjustable_value(
    target,
    property,
    target_value,
    tolerance,
    max_attempts
)
```

This internal operation is not a separate public tool. It is invoked only after `adjust_control` resolves `selector | element_id` into a target and maps:

- `property` to the adjustable runtime property
- `targetValue` to `target_value`
- omitted `tolerance` to the implementation default defined below
- omitted `maxAttempts` to the implementation default defined below


Defaults:

- `tolerance = 0` for discrete controls
- `tolerance = max(step / 2, 0.01 * normalized_range)` for continuous controls when a step is unavailable
- `maxAttempts = 5`

## Compatibility Notes

This specification intentionally tightens the current runtime contract.

Compared with the current implementation:

- Exactly one of `selector` or `element_id` shall be supplied. Supplying neither or both is invalid.
- The default tolerance becomes dynamic as defined by this specification instead of the current implementation default.
- The default `maxAttempts` becomes `5`.

These changes require corresponding updates to the existing `adjust_control` implementation before this specification can be considered fully implemented.

---

# Preconditions

Before execution the following conditions must be satisfied:

1. Target successfully resolved using Richer Element Identity.
2. Target passes Actionability Resolution.
3. UI state satisfies Wait and Synchronization Reliability.
4. The requested `property` resolves to a supported numeric adjustable domain.
5. At least one strategy described in Strategy Detection is supported for the resolved target.

If any precondition fails, execution shall terminate without attempting adjustment.

---

# Execution Model

## Phase 1 — Resolve

Resolve the target using the existing element resolution pipeline.

If resolution fails:

```
return ELEMENT_NOT_FOUND
```

---

## Phase 2 — Validate

Evaluate actionability.

The target must satisfy the Actionability Resolution specification.

If validation fails:

```
return ELEMENT_NOT_INTERACTABLE
```

---

## Phase 3 — Read Current State

Read authoritative runtime state for the requested property.

The implementation shall attempt to obtain:

- current raw value
- minimum raw value
- maximum raw value
- discrete increment or step size, if available
- raw accessibility value, if this is the authoritative platform state
- platform control state required by the selected strategy

Derived semantic hints may be used for planning or strategy selection, but shall not be used as the success criterion for verification.

If the current value cannot be read from raw control state, readable accessibility state, or platform control state:

```text
return UNKNOWN
```

---

## Phase 4 — Select Adjustment Strategy

Select the first supported strategy from the deterministic platform-specific order defined in Strategy Detection.

Strategy support must be proven by runtime capabilities on the resolved target. Control type names, labels, or derived semantic hints alone do not prove support.

If no strategy is supported:

```text
return ELEMENT_NOT_INTERACTABLE
```

---

## Phase 5 — Execute

Normalize the requested value into the control domain defined in Value Domains and Normalization.

Apply the selected strategy toward the normalized target.

Execution may consist of multiple bounded operations, but shall not exceed `maxAttempts`.

After each operation:

1. wait for the existing synchronization contract to report a stable readable state
2. read authoritative runtime state
3. compare the actual normalized value against the target and tolerance

No additional adjustment shall be attempted after success.

---

## Phase 6 — Verify

Verification must use authoritative runtime state only.

Valid sources are:

- raw readable control value
- raw accessibility value when exposed as the platform control value
- platform-native control state

Derived semantic metadata may not be used as proof of success.

If:

```text
abs(actual_normalized - target_normalized) <= tolerance
```

the operation succeeds.

A successful response shall contain the existing `adjust_control` response shape and include the final readable value when the current runtime contract exposes it.

If the value remains outside tolerance after `maxAttempts`:

```text
return CONTROL_CONVERGENCE_FAILED
```

---

# Strategy Detection

Strategy selection is deterministic and platform-specific.

## Android Strategy Order

### 1. Direct platform control action

Support is proven when the resolved Android node or control exposes a runtime action capable of setting or adjusting the requested numeric value directly.

Initial implementation should target, in order:

- Android Accessibility `ACTION_SET_PROGRESS`, where supported.
- Jetpack Compose `SemanticsActions.SetProgress`, when exposed by the semantics tree.

Additional direct-value mechanisms may be added in future revisions provided they preserve the deterministic strategy ordering defined by this specification.

Examples include:

- an accessibility or automation action equivalent to setting progress
- a platform control API that accepts the requested numeric value
- a Compose testing or runtime action that exposes direct progress/value mutation

The implementation shall invoke the direct set-value action when available.

### 2. Increment/decrement accessibility action

Support is proven when the target exposes readable current value and executable increment and/or decrement actions.

The implementation shall:

1. compare current value with target value
2. choose increment or decrement deterministically
3. execute one action
4. synchronize and verify
5. repeat until success or `maxAttempts`

### 3. Coordinate fallback

Support is proven only when:

- the target has stable bounds
- the value domain has readable minimum and maximum values
- the control is visible and interactable
- the requested value can be mapped deterministically to a coordinate within the control track

The implementation shall map the normalized target proportionally into the stable control bounds and perform the existing coordinate interaction primitive.

## iOS Strategy Order

### 1. Direct platform control action

Support is proven when the resolved UIKit, SwiftUI, XCTest, or accessibility element exposes a writable value or direct adjustment API for the requested property.

Initial implementation should target, in order:

- XCTest-supported direct value mutation for adjustable controls.
- UIKit accessibility controls exposing writable adjustable values.

Additional direct-value mechanisms may be added in future revisions provided they preserve the deterministic strategy ordering defined by this specification.

The implementation shall invoke the direct value-setting API when available.

### 2. Accessibility increment/decrement action

Support is proven when the target exposes:

- a readable accessibility value
- an increment action and/or decrement action

The implementation shall apply one action per attempt, then synchronize and verify the updated readable value.

### 3. Coordinate fallback

Support is proven only when:

- the element frame is stable
- the numeric minimum and maximum are readable
- the target value maps deterministically to a point within the adjustable track
- the control is visible and interactable

The implementation shall use the existing coordinate gesture primitive and then verify using authoritative runtime state.

## Strategy Rules

- Direct value setting always takes priority over incremental adjustment.
- Incremental adjustment always takes priority over coordinate fallback.
- Strategy selection shall not change between attempts unless the selected strategy becomes unavailable in newly read runtime state.
- If a selected strategy becomes unavailable, the implementation may select the next supported strategy once, using the same deterministic order.

---

# Value Domains and Normalization

The initial public contract is numeric.

The implementation shall normalize supported control values into a finite numeric domain before adjustment and verification.

## Continuous Values

Continuous sliders and seek bars use their readable numeric minimum and maximum values directly.

Example:

```text
min = 0.0
max = 1.0
targetValue = 0.65
```

## Discrete Steps

When a step size is available, the target shall be quantized to the nearest valid step before execution.

```text
quantized = min + round((targetValue - min) / step) * step
```

The quantized value becomes the verification target.

## Percentage Values

Percentage controls are represented in the numeric domain `0..100` unless the runtime control exposes a different authoritative numeric domain.

The implementation shall not silently convert `0.5` to `50` or `50` to `0.5`. The caller must supply the value in the domain exposed by the tool response or current control state.

## Rating Values

Ratings use their readable numeric scale, such as `0..5` or `1..10`.

Half-step or other fractional ratings are supported only when the runtime exposes the corresponding step size.

## String Accessibility Values

String values are supported only when they can be parsed without ambiguity into a numeric value and optional unit.

Accepted examples include:

- `"50%"` -> `50`
- `"3 of 5"` -> `3`, with maximum `5`
- `"Volume, 7"` -> `7` only when the platform exposes `7` as the readable control value

Localized or free-form strings that cannot be parsed deterministically are unsupported and return:

```text
return UNKNOWN
```

## Range Validation

If `targetValue` is outside the readable normalized range:

```text
return CONTROL_CONVERGENCE_FAILED
```

Although an out-of-range request is detected before adjustment begins, this specification classifies it as `CONTROL_CONVERGENCE_FAILED` to remain compatible with the existing shared runtime error contract.

A dedicated `OUT_OF_RANGE` runtime error may be introduced in a future revision without changing the adjustment model.

The implementation shall not silently clamp an out-of-range request unless the existing `adjust_control` contract explicitly requires clamping.

---

# Failure Modes

The implementation shall use existing runtime error codes.

| Runtime code | Condition |
|----------|-------------|
| ELEMENT_NOT_FOUND | Neither `selector` nor `element_id` resolves to a target |
| ELEMENT_NOT_INTERACTABLE | The target fails actionability checks, the property is unsupported, or no valid adjustment strategy is available |
| CONTROL_CONVERGENCE_FAILED | The target remains outside tolerance after `maxAttempts`, or the requested value is outside the supported numeric range |
| UNKNOWN | Required readable value or range state is unavailable, a string value cannot be parsed deterministically, or an unmapped platform failure occurs |

The implementation shall not introduce new public failure codes for this capability unless the shared runtime error contract is revised separately.

---

# Acceptance Criteria

The implementation is complete when all of the following automated fixtures or smoke scenarios pass on each supported platform.

## Contract Tests

1. `adjust_control` accepts exactly one of `selector` or `element_id`.
2. `property`, `targetValue`, `tolerance`, and `maxAttempts` map to the internal operation without renaming or unit conversion ambiguity.
3. Omitting `tolerance` and `maxAttempts` applies the defaults defined in this specification.
4. Invalid target resolution returns `ELEMENT_NOT_FOUND` in the existing error response shape.

## Android Fixtures

1. A continuous slider exposing direct set-progress support reaches the requested target within tolerance using one direct action.
2. A discrete slider exposing a readable step size quantizes the request to the nearest valid step and verifies the quantized value.
3. An adjustable control exposing only increment/decrement actions converges within `maxAttempts` and performs one verified increment or decrement per attempt.
4. A coordinate-fallback slider with stable bounds and readable range maps the target deterministically and verifies the resulting raw control value.
5. A non-adjustable or non-interactable control returns `ELEMENT_NOT_INTERACTABLE`.
6. A control whose value remains unchanged after `maxAttempts` returns `CONTROL_CONVERGENCE_FAILED`.
7. A control with no readable numeric or parseable accessibility value returns `UNKNOWN`.

## iOS Fixtures

1. A UISlider or equivalent control exposing direct writable value reaches and verifies the target in one direct action.
2. An accessibility-adjustable element exposing increment/decrement actions converges through bounded verified actions.
3. A coordinate-fallback slider with stable frame and readable range maps the target deterministically and verifies using platform control state or readable accessibility value.
4. A rating control verifies a valid discrete or fractional rating according to its exposed step size.
5. An unsupported adjustable-looking element returns `ELEMENT_NOT_INTERACTABLE` rather than attempting an unproven strategy.
6. An unparseable localized accessibility value returns `UNKNOWN`.

## Verification Assertions

For every successful fixture:

- the response uses the existing successful `adjust_control` response shape
- the final authoritative runtime value is within tolerance of the normalized target
- no derived semantic hint is used as the success assertion
- the number of adjustment attempts is less than or equal to `maxAttempts`

For every failed fixture:

- the response uses the existing error response shape
- the runtime code matches one of `ELEMENT_NOT_FOUND`, `ELEMENT_NOT_INTERACTABLE`, `CONTROL_CONVERGENCE_FAILED`, or `UNKNOWN`
- no additional adjustment occurs after the terminal failure is known

---

# Dependencies

Depends on:

- Stronger State Verification
- Richer Element Identity
- Wait and Synchronization Reliability
- Actionability Resolution

Strengthens:

- Better Compose / Custom Control Semantics
- Adjustable Control Precision Hardening
- Pinch to Zoom

---

# Future Work

The following capabilities are intentionally excluded from this specification:

- binary-search convergence
- adaptive convergence algorithms
- drag-versus-tap optimisation
- control-specific heuristics
- fine-grained precision tuning
- gesture optimisation

These are covered by the **Adjustable Control Precision Hardening** specification.

---

# Determinism Requirements

Given identical:

- snapshot
- control state
- requested value
- tolerance
- maxAttempts

the implementation shall produce identical behaviour.

Execution shall not rely on:

- randomness
- timing heuristics
- hidden mutable state
- undefined platform behaviour

---