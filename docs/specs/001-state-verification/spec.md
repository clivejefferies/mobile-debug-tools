# RFC-001: Stronger State Verification

Priority: 1
Depends on: Snapshot v1
Related Roadmap Item: Priority 1 — Stronger State Verification

---

# 1. Problem

Agents currently infer UI control state too often from surrounding text or visual clues instead of reading authoritative control state.

This causes:

- Retry loops caused by uncertainty
- False-positive verification
- Brittle behavior in dynamic UIs
- Poor handling of sliders, toggles, selectors, and custom controls

Current failure mode:

Infer:
- “Toggle looks enabled”
- “Dropdown probably changed”
- “Slider appears moved”

Desired:

Read:
- checked=true
- selected="Dark Mode"
- value=75

Shift from visual inference to explicit state introspection.

---

# 2. Goals

This RFC introduces:

1. Readable control state in snapshot responses
2. Stronger verification primitives for state assertions
3. Clear conflict and fallback semantics
4. Backward-compatible protocol extension

Success goals:

- Reduce retries on stateful tasks
- Improve first-pass verification success
- Reduce ambiguity in control manipulation

---

# 3. Non-Goals

This RFC does not:

- Introduce planner or recovery logic
- Add agent orchestration behavior
- Redesign semantic enrichment architecture
- Add gesture capabilities (covered by later RFCs)
- Add control interaction contracts (later RFC)

---

# 4. Proposed Model

## 4.1 State Model Additions

Add optional readable state block to elements where applicable.

Candidate fields:

- checked
- selected
- value
- focused
- expanded
- enabled
- text_value

Illustrative shape:

```json
{
  "element_id": "wifi_toggle",
  "role": "switch",
  "state": {
    "checked": true,
    "enabled": true
  }
}
```

Rules:

- State is optional when unavailable.
- Absence of state is not negative assertion.
- Raw exposed state is authoritative.
- Derived semantic guesses may not override raw state.

---

## 4.2 Verification Primitive Additions

Canonical verification primitive:

```text
expect_state(element, property, expected)
```

Canonical model is the normative API.

Convenience aliases MAY be exposed:

- expect_checked(...)
- expect_value(...)
- expect_selected(...)
- expect_expanded(...)
- expect_enabled(...)

Rules:

- `expect_state` is the authoritative verification primitive.
- Specialized expect_* forms are aliases over the same semantics.
- New control properties should extend `expect_state`, not proliferate bespoke tools.

Rationale:

- Preserves extensibility
- Avoids tool surface explosion
- Keeps a single verification model
- Retains ergonomic shortcuts for agents

---

## 4.3 Minimum v1 Widget Coverage

Implementations MUST support readable state and verification for:

Required v1 controls:

- Switch / toggle
- Slider / seekbar
- Text input
- Single-select dropdown or picker

Deferred from v1:

- Multi-select controls
- Date/time pickers
- Rich custom composite widgets
- Advanced gesture-driven controls

RFC-001 is considered incomplete without required v1 control support.

---

## 4.4 Value Normalization

### Numeric values

Implementations MUST expose canonical normalized values where applicable.

Preferred shape:

```json
{
  "value": 75,
  "value_range": {
    "min": 0,
    "max": 100
  },
  "raw_value": 0.75,
  "raw_value_unit": "fraction"
}
```

Canonical/raw model rules:

- `value` is the canonical comparison value used for verification.
- `raw_value` is optional implementation-native representation and MUST NOT be used as canonical comparison state.
- If both are present, canonical and raw representations MUST refer to the same underlying control state.
- Agents and verification primitives MUST prefer canonical values over raw values.

---

### Selected values

Selected values SHOULD expose stable identity and user-visible label when possible.

Preferred shape:

```json
{
  "selected": {
    "id": "dark_mode",
    "label": "Dark Mode"
  }
}
```

Rules:

- Prefer stable identifiers over label-only values.
- Labels may vary; identifiers should remain stable.
- String-only selected values allowed only when richer identity unavailable.

---

# 5. Guardrails and Conflict Semantics

Required invariants:

## Raw wins on conflict

If raw state conflicts with derived semantics:

- raw state is authoritative
- semantic layer is advisory only

---

## Missing state handling

If state unavailable:

- do not infer false
- allow agent fallback strategies
- degrade gracefully

---

## Verification ownership

State assertions remain owned by:

- expect_* verification

Observation and verification stay distinct.

---

# 6. Protocol Delta (Draft)

Snapshot schema extension:

```json
state?: {
  checked?: boolean,
  selected?: string,
  value?: number | string,
  focused?: boolean,
  expanded?: boolean,
  enabled?: boolean,
  text_value?: string
}
```

Notes:

- Additive only
- Backward compatible
- No breaking changes intended

Versioning approach under consideration:

- capability flag preferred over protocol fork

Illustrative:

```json
capabilities: {
  state_verification_v2: true
}
```

---

# 7. Failure Modes

Must define behavior for:

## Unsupported state

Example:
custom control exposes no readable value.

Expected behavior:
- omit state field
- agent may fall back to other evidence

---

## Partial state

Example:
slider exposes value but not enabled.

Expected:
- partial state valid
- no synthetic completion

---

## Stale reads
If snapshot freshness is uncertain, no assumptions of real-time synchronization.
(Interaction with synchronization RFC expected later.)

---

# 8. Acceptance Test Vectors

Representative benchmark flows:

## Toggle

Given:
- toggle off

When:
- agent toggles on

Then:
- expect_checked passes true

---

## Slider

Given:
- slider at 50

When:
- set to 75

Then:
- expect_value verifies 75

---

## Dropdown

Given:
- current option A

When:
- select option B

Then:
- expect_selected verifies B

---

## Input

Given:
- editable text field

When:
- enter new value

Then:
- text_value reflects update

---

# 9. Acceptance Criteria

RFC considered complete when:

- Core widget readable state implemented
- Verification primitives implemented
- Representative benchmark flows passing
- Documentation and schema updated
- Roadmap done criteria satisfied

---

# 10. Success Metrics

Target outcomes:

- 30%+ retry reduction on stateful tasks
- Higher first-pass verification success
- Reduced false positive verifications

Measured against roadmap KPIs.

---

# 11. Normative Requirements (v1)

Implementations conforming to RFC-001:

MUST:

- Support readable state for required v1 controls
- Implement `expect_state(...)`
- Treat raw exposed state as authoritative
- Preserve additive backward compatibility
- Gracefully omit unsupported state rather than synthesize values

SHOULD:

- Expose normalized numeric values
- Expose stable identifiers for selected values
- Support convenience expect_* aliases

MAY:

- Expose raw platform-native values alongside canonical values
- Extend support beyond required v1 controls

---

# 12. Resolved Design Decisions

Former open questions resolved for RFC-001:

1. Verification API:
- `expect_state(...)` is normative.
- expect_* forms are convenience aliases.

2. Raw vs semantic split:
- Raw exposed state remains authoritative.
- Semantic layer remains advisory only.

3. Numeric normalization:
- Canonical normalized values are normative.
- Raw values are optional supplemental representation.

4. Capability negotiation:
- Capability flag approach retained for initial implementation.

5. v1 widget scope:
- Defined by checklist in Section 4.3.

No unresolved design blockers remain for RFC-001 draft scope.

---

# 13. Deferred To Later RFCs

Deferred to later RFCs:

- Interaction contracts
- Compose semantic enrichment extensions
- Wait/synchronization improvements
- Action trace correlation
- Gesture support