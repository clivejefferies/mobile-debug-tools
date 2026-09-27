# RFC-003: Wait and Synchronization Reliability

Priority: 3  
Depends on: RFC-001 (Stronger State Verification), RFC-002 (Platform-Native Element Metadata and Resolution Hints)

---

# 1. Problem

Agents can often identify the right element (RFC-002) and verify the right state (RFC-001), but still fail because they act before the UI has reached the intended post-action state.

This causes:

- retries caused by racing the UI
- false failures from stale snapshots
- overuse of network/log verification when UI evidence should suffice
- flakiness in asynchronous and in-place update flows
- unreliable behaviour in Compose-heavy or thin accessibility trees

Current system limitations:

- wait_for_ui is underused after actions involving async state changes
- current waits focus on expected elements appearing, not general UI transition detection
- snapshot staleness is not explicitly surfaced
- loading state transitions are inconsistently observable

---

# 2. Goals

This RFC introduces:

1. UI-first synchronization policy after actions
2. Snapshot staleness and revision metadata
3. UI-change based waiting for in-place updates
4. Structured loading-state detection
5. Compose-aware synchronization hints

Success goals:

- reduce retries caused by premature actions
- increase successful post-action verification
- reduce unnecessary fallbacks to logs/network checks
- improve reliability in asynchronous UI flows

---

# 3. Non-Goals

This RFC does not:

- redefine state verification semantics (RFC-001)
- redefine element identity contracts (RFC-002)
- add new interaction primitives (long press, pinch, etc.)
- replace network or log verification where no UI outcome exists

---

# 4. Proposed Model

## 4.1 UI-First Synchronization Contract (v1)

Default post-action flow SHOULD be:

```text
action
→ wait_for_ui(expected outcome)
→ verify state
→ only fall back to network/logs when no UI outcome exists or wait fails
```

Tool-level contract:

- After actions expected to cause visible UI changes, agents SHOULD invoke wait_for_ui or wait_for_ui_change before verification.
- wait_for_ui SHOULD be used when an expected element or explicit outcome is known.
- wait_for_ui_change SHOULD be used for in-place mutations where a specific element target is not known.
- wait_for_screen_change SHOULD remain preferred for full navigation transitions when available.

Rules:

- UI evidence MUST be preferred over network or log evidence when a UI outcome is expected.
- Actions that trigger navigation, async mutation, or visible state changes SHOULD be followed by a wait.
- Network/log checks are fallback signals, not primary synchronization mechanisms.
- This synchronization order is normative tool behavior for agents, not advisory prose.

---

## 4.2 Snapshot Revision Contract

All snapshot responses MUST include revision metadata.

Emission scope:

- snapshot_revision and captured_at_ms MUST be emitted on snapshot responses.
- get_ui_tree responses SHOULD emit the same fields when backed by the same snapshot generation layer.
- If both surfaces exist, revision values MUST be consistent across them when derived from the same underlying snapshot.

Required snapshot envelope:

```json
{
  "snapshot_revision": 184,
  "captured_at_ms": 1714452012301
}
```

Field requirements:

- snapshot_revision REQUIRED on every snapshot response.
- captured_at_ms REQUIRED on every snapshot response.

Source of truth:

- snapshot_revision originates in the snapshot generation layer.
- It MUST increment when a meaningful hierarchy delta is detected.
- Cosmetic-only changes MUST NOT increment revision.

Meaningful deltas include:

- node added or removed
- visible text mutation
- control state change
- list content mutation
- navigation or view transition

Cosmetic churn examples (must not increment):

- cursor blink
- focus-only changes
- animation-only transitions
- timestamp or unrelated ephemeral text changes

Rules:

- Agents SHOULD use revision changes as synchronization signals.
- Stale revisions SHOULD trigger reacquisition before verification.
- This extends the snapshot response contract defined by RFC-002.

- Snapshot responses are the normative required emission surface; get_ui_tree emission is recommended for consistency.
- snapshot_revision MUST be monotonically increasing within a session.

---

## 4.3 wait_for_ui_change API

Concrete API contract:

```ts
wait_for_ui_change({
  expected_change?: "hierarchy_diff" | "text_change" | "state_change",
  timeout_ms?: number,
  stability_window_ms?: number
}) => {
  success: boolean,
  observed_change: "hierarchy_diff" | "text_change" | "state_change" | null,
  snapshot_revision?: number,
  timeout: boolean
}
```

Relationship to other wait primitives:

- wait_for_screen_change remains the preferred primitive for navigation-level transitions.
- wait_for_ui_change is the preferred primitive for non-navigation UI mutations and in-place updates.
- wait_for_ui_change is additive to wait_for_screen_change, not a replacement for it.

Rules:

- stability_window_ms represents time a detected change must remain stable before success.
- Meaningful delta semantics are inherited from Section 4.2.
- wait_for_ui_change complements wait_for_ui; it does not replace it.

- Agents SHOULD prefer wait_for_screen_change for navigation and wait_for_ui_change for non-navigation changes.

---

## 4.4 Structured Loading-State Contract

Loading signals are OPTIONAL overall, but when a detectable loading signal exists they SHOULD be surfaced on snapshot responses and UI tree responses, and if emitted they MUST conform to the contract below.

Required shape:

```json
{
  "loading_state": {
    "active": true,
    "signal": "progress_indicator",
    "source": "snapshot"
  }
}
```

Required fields:

- active
- signal
- source

Rules:

- Loading signals are synchronization hints only.
- Loading completion MUST NOT alone be treated as success.
- If emitted, the shape above MUST be used.
- Absence of loading_state is valid when no reliable loading signal is detectable; malformed or partial loading_state emission is not valid.

---

## 4.5 Compose-Aware Synchronization Hints

For Compose or thin accessibility structures:

Systems SHOULD support:

- merged semantic node changes as wait signals
- text mutations within existing nodes
- in-place recomposition awareness

These are synchronization hints layered on top of standard wait behaviour.

---

# 5. Failure Modes

## 5.1 Premature Action Progression

If an action is followed immediately by verification without waiting:

- system SHOULD bias toward suggesting wait_for_ui
- retries SHOULD prefer synchronization correction before repeated action execution

---

## 5.2 Stale Snapshot Reads

If verification uses an old snapshot:

- revision metadata SHOULD expose staleness
- agents SHOULD reacquire snapshot before retrying verification

---

## 5.3 No Visible UI Outcome

If no UI outcome is expected:

- network/log verification MAY be primary evidence
- UI-first policy does not apply rigidly

---

## 5.4 False Positive UI Change Detection

If unrelated UI churn triggers early wait completion:

- systems SHOULD reject cosmetic-only changes using Section 4.2 rules
- agents SHOULD prefer stability windows before considering waits satisfied

---

# 6. Acceptance Criteria

RFC-003 specification is complete when:

- Snapshot Revision Contract is fully defined and mandatory.
- wait_for_ui_change API contract is fully defined.
- Loading-State Contract required schema is defined.
- Synchronization tool-selection rules are explicitly specified.
- False-positive change handling is specified.

Implementation readiness success is measured when:

- snapshot revisions reduce stale-read retries
- synchronization retries decrease
- post-action verification success increases

---

# 7. Success Metrics

- Fewer retries caused by timing/synchronization errors
- Higher post-action verification success rate
- Reduced unnecessary fallback to network/log evidence
- Improved stability in asynchronous and Compose-heavy flows

---

# 8. Deferred To Later RFCs

- Advanced subscriptions / notify-when-element-appears APIs
- Full action-to-ui trace correlation (Priority 7)
- Gesture-trigger-specific synchronization logic
- Element appearance subscription / notify-when-ready APIs

---

This RFC standardises temporal reliability and synchronization signals layered on top of state verification and element identity guarantees from RFC-001 and RFC-002.