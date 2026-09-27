# RFC-002: Platform-Native Element Metadata and Resolution Hints

Priority: 2  
Depends on: RFC-001 (Stronger State Verification)

---

# 1. Problem

Agents currently rely on brittle or inconsistent selectors when identifying UI elements.

This leads to:

- selector drift across UI updates
- failure to target correct elements in dynamic layouts
- retry loops due to ambiguous element matching
- inability to distinguish visually similar components

Current system limitations:

- weak or inconsistent element identifiers
- over-reliance on hierarchy position or text inference
- insufficient metadata for stable targeting

This RFC assumes stable identity may be derived from underlying platform accessibility or testing hooks, but does not assume a universal cross-platform stable identifier model.

This RFC does not assume that a universal or guaranteed stable_id exists across all platforms. Instead, it defines a best-effort model based on platform-native identifiers and developer-provided metadata, supplemented by resolution hints.

---

# 2. Goals

This RFC introduces:

1. Platform-native element identity metadata for UI targeting
2. Hierarchy-independent element references
3. Selector confidence metadata for reliability
4. Structured fallback resolution strategy

Success goals:

- Increase element match success rate
- Reduce selector-related retries
- Improve robustness across UI updates and Compose-heavy layouts

---

# 3. Non-Goals

This RFC does not:

- Modify state verification logic (RFC-001)
- Introduce gesture handling (future RFCs)
- Define synchronization/waiting behaviour (RFC-003)
- Add new interaction primitives beyond identification and selection

---

# 4. Proposed Model

## 4.1 Stable Element Identity

Each UI element SHOULD expose a stable identifier when available.

Preferred model:

```json
{
  "element_id": "wifi_toggle",
  "stable_id": "settings_wifi_toggle",
  "role": "switch"
}
```

Rules:

- stable_id SHOULD be derived from platform-native or developer-provided identifiers when available
- stable_id MAY remain consistent across UI renders where supported by the platform
- stable_id is a preferred targeting key when present, but not guaranteed to exist
- element_id is session-scoped and may change between snapshots

---

## 4.1.1 Stable ID Origin

stable_id MUST be derived from platform-provided or framework-provided identifiers when available.

Acceptable sources include:

- Android: resource-id, content-desc (when stable and explicitly set)
- iOS: accessibilityIdentifier
- Web: data-testid or equivalent testing attributes
- Compose: semantics properties or developer-assigned test tags

Rules:

- stable_id MUST NOT be heuristically generated from visual text alone
- stable_id SHOULD prefer developer-defined identifiers over inferred values
- If no reliable source exists, stable_id MUST be omitted (not fabricated)

---

## 4.1.2 Stable ID Collision Handling

If multiple elements share the same stable_id:

- system MUST treat this as a collision state
- all matching elements MUST be returned
- agent MUST disambiguate using role, label, or hierarchy context

Rules:

- collisions MUST NOT be silently resolved by system-level heuristics
- stable_id uniqueness is a best-effort constraint, not a guarantee

---

## 4.2 Selector Confidence Model

Each element MAY include confidence metadata for selection reliability.

```json
{
  "selector": "Text('WiFi')",
  "confidence": 0.92
}
```

Rules:

- Confidence reflects likelihood of correct element match
- Low confidence SHOULD trigger fallback resolution
- Confidence MUST NOT be treated as deterministic truth

---

## 4.2.1 Confidence API Exposure

Confidence metadata MUST be exposed as part of the element selector object.

Preferred shape:

```json
{
  "selector": "Text('WiFi')",
  "confidence": {
    "score": 0.92,
    "reason": "unique_text_match"
  }
}
```

Rules:

- confidence.score MUST be a float between 0 and 1
- confidence.reason SHOULD indicate primary matching heuristic
- confidence MUST be attached to selector metadata, not state

This structure is expected to be present in both snapshot metadata and any downstream selector debugging output produced by the resolution engine.

---

## 4.3 Fallback Resolution Strategy

Resolution order MUST be:

1. stable_id (if unique or disambiguated via collision handling)
2. platform-native metadata match (role + label + test_tag)
3. selector + confidence scoring
4. structural hierarchy fallback
5. text inference (last resort)

Agents MUST prefer higher-order resolution strategies before falling back.

---

## 4.4 Element Metadata Model (Platform-Aware)

For Compose and similar UI systems, elements MUST expose structured metadata rather than inferred semantic paths.

Preferred model:

```json
{
  "role": "button",
  "label": "Save",
  "text": "Save",
  "test_tag": "settings_save_button",
  "semantic": {
    "is_clickable": true,
    "is_container": false
  }
}
```

Rules:

- semantic_path MUST NOT be used as a required field
- platform-native metadata (test_tag / accessibility id) is preferred
- hierarchy information MAY be included but is not authoritative

---

## 4.5 Snapshot Response Contract (v1)

This RFC defines the expected structure of element metadata returned by the snapshot observation tool.

Each element in a snapshot MUST conform to the following shape:

```json
{
  "element_id": "string (session-scoped)",
  "stable_id": "string (optional)",
  "role": "string",
  "label": "string (optional)",
  "text": "string (optional)",
  "test_tag": "string (optional)",
  "selector": {
    "value": "string",
    "confidence": {
      "score": 0.0-1.0,
      "reason": "string"
    }
  }
}
```

Rules:

- element_id MUST be present and session-scoped
- stable_id MAY be present when provided by platform or developer metadata
- selector.confidence MUST be attached when selector is present
- test_tag SHOULD be preferred over inferred identifiers where available

Note:
This schema replaces ambiguous "snapshot response" references in prior sections and defines the canonical output contract for element identity and resolution metadata.

This contract defines the boundary between platform-derived metadata and resolution-engine-generated metadata, and is the single source of truth for all element identity fields used by downstream agents.


## 4.6 API Surface Mapping

This section defines where each field in the Snapshot Response Contract is produced within the system.

### 4.6.1 Snapshot Tool Responsibility

The snapshot observation tool (e.g. `observe_ui_snapshot`) is responsible for returning the raw UI tree enriched with platform-derived metadata.

It MUST return elements conforming to the Snapshot Response Contract (Section 4.5).

In the current codebase, this maps to the `observe_ui_snapshot` pipeline (or equivalent snapshot generation function), which MUST return data conforming to the SnapshotResponse TypeScript contract defined in Section 4.6.4.

### 4.6.2 Field Origin Mapping

Each field in the element model has a defined source of truth:

- element_id:
  - Origin: Snapshot session layer
  - Responsibility: Generated per snapshot traversal
  - Scope: Session-scoped only

- stable_id:
  - Origin: Platform adapter layer (Android/iOS/Web/Compose)
  - Responsibility: Extracted from platform-native identifiers
  - Constraint: MUST NOT be generated by heuristics alone

- role:
  - Origin: Accessibility tree / platform UI framework
  - Responsibility: Semantic role mapping from native UI system

- label / text:
  - Origin: Platform accessibility node
  - Responsibility: Visible or accessible text content extraction

- test_tag:
  - Origin: Developer-defined metadata (when available)
  - Responsibility: Explicit testing identifiers (e.g. accessibilityIdentifier, data-testid)

- selector:
  - Origin: Resolution engine (post-processing layer)
  - Responsibility: Generated match expression for agent targeting

- selector.confidence:
  - Origin: Resolution engine
  - Responsibility: Heuristic confidence scoring of selector correctness

### 4.6.3 Layer Separation Rule

The system MUST maintain strict separation between:

- Platform extraction layer (stable_id, role, label, test_tag)
- Resolution layer (selector, confidence)
- Session layer (element_id)

No layer is permitted to overwrite another layer's source of truth.

---

## 4.6.4 TypeScript Contract (Implementation Binding)

This section defines the concrete TypeScript-level contract used by the codebase for snapshot and element resolution.

These types represent the implementation binding for the Snapshot Response Contract (Section 4.5).

```ts
export interface SelectorConfidence {
  score: number; // 0.0 - 1.0
  reason: string;
}

export interface ElementSelector {
  value: string;
  confidence: SelectorConfidence;
}

export interface ElementSnapshot {
  element_id: string; // session-scoped
  stable_id?: string;
  role: string;
  label?: string;
  text?: string;
  test_tag?: string;
  selector?: ElementSelector;
}

export interface SnapshotResponse {
  elements: ElementSnapshot[];
}
```

Notes:

- This interface MUST align with the runtime snapshot implementation.
- This is the canonical mapping between RFC definition and codebase types.
- Any deviation in implementation MUST be reflected in a future RFC revision.

---

# 5. Failure Modes

## 5.1 Ambiguous match

If multiple elements match a selector:

- The snapshot MUST include all matching candidates in the underlying element tree or debug snapshot.
- Current action APIs (e.g. find_element / tap / wait_for_ui) MAY return a single best-effort match for compatibility.
- When ambiguity exists, systems SHOULD expose candidate alternatives via snapshot inspection or debug instrumentation.
- Future extensions MAY introduce explicit multi-candidate resolution APIs, but are not required for RFC-002 compliance.

---

## 5.2 Missing stable identity

If stable_id is unavailable:

- fallback hierarchy MUST be used
- selector confidence SHOULD reflect reduced certainty and include reason="no_stable_id"
- retries MAY be triggered

---

## 5.3 Layout drift

If UI structure changes:

- stable_id remains valid if preserved
- structural selectors may degrade
- confidence SHOULD reflect uncertainty

---

# 6. Acceptance Criteria

RFC-002 is complete when:

- platform-native identity metadata (stable_id, test_tag, role) is present where available
- selector confidence metadata is present and conforms to Snapshot Response Contract (Section 4.5)
- fallback resolution strategy is implemented
- element match success rate improves on benchmark flows
- selector-related retries are reduced

---

# 7. Success Metrics

- Higher element resolution match rate using platform-native metadata + confidence hints
- Reduced selector retries
- Lower failure rate on UI updates
- Improved stability in Compose UI trees

---

# 8. Out of Scope

- State verification (RFC-001)
- Wait/synchronization (RFC-003)
- Gestures (future RFCs)
- Action tracing

This RFC is scoped as a metadata and resolution hint layer. It does not guarantee stable identity across all platforms, but standardises how identity signals are exposed and consumed.