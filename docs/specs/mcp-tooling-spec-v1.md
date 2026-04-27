# MCP Tooling Specification — Spec v1 (Refined)

## 1. Scope

This specification defines the runtime contract for MCP tools used to interact with mobile applications.

It standardizes:

- action execution semantics
- verification model
- failure handling
- response shape constraints

This spec is incremental and aligned with the current implementation. It does not introduce new tools or require architectural redesign.

## 2. Core Model

The system is based on a strict separation:

- Action tools perform execution
- Verification tools determine outcome
- `wait_for_*` tools resolve and synchronize
- Observation tools inspect state

## 3. Execution Model

Canonical flow for verifiable interactions:

`RESOLVE -> ACT -> WAIT (optional) -> EXPECT`

This flow applies when outcome verification is required.

It does not apply to:

- pure inspection tools
- observation-only flows
- non-verifiable or exploratory actions

Outcome-specific guidance:

- visible navigation expected -> `wait_for_screen_change` (optional) -> `expect_screen`
- local UI change expected -> `wait_for_ui` (optional) -> `expect_element_visible`
- readable element state expected -> `wait_for_ui` (optional) -> `expect_state`
- backend/API activity expected without a visible UI change -> compare `get_screen_fingerprint` before/after, then call `get_network_activity` immediately after the action and `classify_action_outcome` with the observed requests

For backend/API activity, `wait_for_screen_change` is not the right verification tool unless a visible transition is also expected.

## 4. Action Tools

### 4.1 Definition

Action tools mutate application state.

Includes:
`start_app`, `restart_app`, `tap`, `tap_element`, `swipe`, `scroll_to_element`, `type_text`, `press_back`

### 4.2 Required Semantics

- `success` MUST represent execution success only
- execution success means the platform command was dispatched without error
- `success` MUST NOT imply outcome success

### 4.3 Action Envelope

MUST be returned in this structure:

```ts
{
  action_id: string,
  timestamp: string,
  action_type: string,
  target: {
    selector: object,
    resolved: object | null
  },
  success: boolean,
  ui_fingerprint_before: string | null,
  ui_fingerprint_after: string | null,
  failure_code?: string,
  retryable?: boolean,
  device?: DeviceInfo,
  details?: object
}
```

Rules:

- `success` is at the top level, not nested
- `target` contains only selection and resolution context
- fingerprints represent observed pre/post UI state on a best-effort basis
- `failure_code` is optional but MUST be used when a structured mapping exists

### 4.4 Allowed Deviations

Explicit temporary exceptions:

- `install_app`, `terminate_app`, `reset_app_data` do not use this envelope
- `scroll_to_element` may temporarily retain outcome-based success semantics
- partial `failure_code` coverage is allowed
- detail richness may vary across tools

## 5. Verification Tools

### 5.1 Definition

Verification tools determine whether the intended outcome occurred.

Primary:

- `expect_screen`
- `expect_element_visible`
- `expect_state`

### 5.2 Required Semantics

- MUST return `success` as a boolean
- `success` MUST represent outcome truth
- MUST be binary and deterministic

Optional fields do not affect `success`:
`observed`, `expected`, `comparison`, `reason`, `confidence`

### 5.3 Authoritative Role

Verification tools are the only authoritative source of outcome truth.

Action tools MUST NOT be used to infer outcome success.

### 5.4 Applicability Rules

An `expect_*` tool is applicable when:

- expected destination screen is known -> `expect_screen`
- expected UI element state is known -> `expect_element_visible`
- expected readable state property is known -> `expect_state`
- outcome is explicitly defined or testable

Rules:

- `wait_for_*` MAY be used before `expect_*` for synchronization
- `wait_for_*` MUST NOT replace `expect_*` when an applicable `expect_*` tool exists
- when no applicable `expect_*` tool exists, `expect_*` MAY be skipped

## 6. wait_for_* Tools

### 6.1 Definition

`wait_for_*` tools provide deterministic resolution and synchronization.

Examples:

- `wait_for_ui`
- `wait_for_screen_change`
- `wait_for_ui_change`

### 6.2 Rules

- MAY resolve UI elements
- MAY synchronize UI/system state
- MUST NOT be treated as final verification when `expect_*` is applicable

### 6.3 Semantics

- `success` indicates condition met or resolution succeeded
- `success` does NOT indicate outcome correctness

## 7. Failure Semantics

### 7.1 Canonical Codes

- `ELEMENT_NOT_FOUND`
- `ELEMENT_NOT_INTERACTABLE`
- `TIMEOUT`
- `NAVIGATION_NO_CHANGE`
- `AMBIGUOUS_TARGET`
- `STALE_REFERENCE`
- `UNKNOWN`

### 7.2 Rules

- `failure_code` MUST be used when a structured mapping exists
- `failure_code` MUST NOT be replaced by string errors
- string errors MAY exist for diagnostics only
- not all tools must emit all codes

### 7.3 Scope

Applies to:

- action tools
- verification tools
- `wait_for_ui`-style tools

## 8. Response Shape

### 8.1 Default

All responses MUST be a single JSON text block.

### 8.2 Allowed Exceptions

Multi-block responses are allowed only for:

- `get_logs`
- `capture_screenshot`
- `build_and_install`

### 8.3 Errors

All handler/runtime errors MUST be JSON-wrapped.

String-only errors are not allowed, including fallback handler errors.

Note: string diagnostics may still appear inside structured JSON payloads where explicitly defined by a tool.

## 9. Observation Tools (Extended Semantics)

Observation tools inspect application state without mutating it.

Examples:

- `capture_debug_snapshot`
- `get_screen_fingerprint`
- `get_network_activity`
- `get_logs`

### 9.1 Snapshot Response Model

`capture_debug_snapshot` MUST return a dual-layer response:

- `raw`: required object
- `semantic`: optional object

The raw layer is authoritative and MUST remain unchanged from the underlying observation data. It is the source of truth and MUST NOT be interpreted or rewritten.

The semantic layer is derived, best-effort, and MUST be generated exclusively from the raw layer.

Raw layer contents include:

- UI hierarchy or accessibility tree
- normalized readable element state where exposed by the platform
- platform-native identity hints such as stable identifiers, roles, and test tags
- snapshot metadata such as `snapshot_revision` and `captured_at_ms`
- `loading_state` when a reliable loading signal is detectable
- screenshot when available
- element-level attributes
- logs and fingerprint/activity observations
- raw error fields when partial collection fails

Semantic layer shape when present:

```ts
{
  screen: string | null,
  signals: Record<string, string | number | boolean> | null,
  actions_available: string[] | null,
  confidence: number,
  warnings: string[]
}
```

Rules:

- `confidence` MUST be between 0 and 1
- `warnings` MUST be present when `semantic` is present
- `semantic` MAY be omitted entirely when derivation is not reliable
- `semantic` MUST be treated as unreliable if it conflicts with raw data
- `actions_available` are hints only and MUST NOT be treated as guaranteed executable actions

### 9.2 Agent Usage Contract

Agents SHOULD use `semantic` for primary decision-making when present.

Agents MUST fall back to `raw` when:

- `semantic` is missing
- `confidence < 0.7`
- `warnings` is non-empty
- semantic output conflicts with expected state or raw data

`semantic` is for planning only and MUST NOT be used for verification.

### 9.3 Relationship to Classification

Semantic signals MAY be used as input to `classify_action_outcome`.

Semantic output MUST NOT replace classification or verification.

Classification remains a supplementary, post-action interpretation mechanism.

## 10. Classification

Tool: `classify_action_outcome`

Rules:

- MAY use UI, network, and log signals
- MUST be deterministic
- MUST NOT replace `expect_*` tools
- MUST be treated as a supplementary signal only
- SHOULD be used with `get_network_activity` when the expected outcome is backend/API activity without a visible UI change

It is not a verification mechanism.

## 11. Execution Patterns

Canonical pattern:

`wait_for_ui -> tap_element -> wait_for_screen_change (optional) -> expect_screen`

For in-place UI mutations, agents SHOULD prefer:

`wait_for_ui_change -> expect_element_visible / expect_state`

Interpretation:

- `tap_element.success` = executed
- `wait_for_screen_change.success` = UI changed
- `wait_for_ui_change.success` = in-place UI mutation observed and stable
- `expect_screen.success` = correct outcome verified

## 12. Known Deviations

Explicitly allowed:

- `install_app`, `terminate_app`, `reset_app_data` not using envelope
- `build_and_install` streaming NDJSON
- platform-specific tools
- partial failure coverage
- `scroll_to_element` outcome-based success (temporary exception)
- extended runtime fields in `list_devices`

## 13. Migration Rules

Must change now:

- uncaught errors must be JSON-wrapped

Should align when touched:

- `tap`, `swipe`, `type_text`, `press_back`
- `start_app`, `restart_app`
- `scroll_to_element`
- `wait_for_ui`
- `capture_debug_snapshot`

No change required:

- `tap_element`
- `expect_screen`
- `expect_element_visible`
- `wait_for_screen_change`

## 14. Guiding Principles

- Actions execute
- Verification proves
- Waiting synchronizes
- Classification assists

## Final Definition

Action success equals execution success.
Outcome success equals verification success.

Verification tools are authoritative when the expected outcome is defined.
