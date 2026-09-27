# RFC 006 — Runtime Action Instrumentation & Binding Layer

## 1. Summary

This RFC defines how the execution model in RFC 005 is mapped onto the current runtime behaviour of the system.

It does not assume a new instrumentation system exists. Instead, it describes how lifecycle semantics are derived from existing execution flows, logs, module behaviour, and lightweight runtime metadata attached to action envelopes.

It specifies:
- how existing `action_type` values are interpreted under RFC 005 semantics
- how lifecycle states are inferred from current runtime execution
- how `src/server` and `src/interact` currently participate in execution
- how legacy and platform actions are incorporated into the model

This RFC is a runtime binding and normalisation layer over existing implementation behaviour.

---

## 2. Problem Statement

RFC 005 defines a unified execution lifecycle:
- Resolved
- Dispatched
- Pending Verification
- Verified
- Failed

However, the current system already contains:
- a concrete `action_type` execution model
- execution logic split across `src/server` and `src/interact`
- platform-specific actions (tap_element, type_text, press_back, start_app, restart_app, scroll_to_element)
- distributed logging and partial instrumentation within modules

There is no central instrumentation system and no explicit lifecycle emitter.
Instead, lifecycle meaning is inferred from runtime behaviour and the `lifecycle_state` / `source_module` fields now attached to action envelopes.

This results in:
- implicit execution state transitions
- distributed observability signals
- non-uniform traceability across actions

---

## 3. Design Goals

This layer MUST:

- Map existing runtime behaviour to RFC 005 lifecycle semantics
- Use existing `action_type` values as the authoritative execution taxonomy
- Derive lifecycle states from observable runtime transitions
- Reflect actual module responsibilities (not idealised separation)
- Work with existing logging and execution hooks
- Preserve compatibility with all current action implementations

---

## 4. Runtime Execution Flow (Observed)

Current observed execution flow:

UI Request
→ src/server (routing + validation)
→ src/interact (execution + platform dispatch)
→ platform layer
→ response handling + logs
→ optional state verification (where available)

Lifecycle states are derived from this flow rather than explicitly emitted.

---

## 5. Action Type Mapping (Current Runtime)

This RFC maps existing `action_type` values to RFC 005 semantics.

| action_type | RFC 005 Semantic Interpretation |
|------------|---------------------------------|
| tap | Selection |
| tap_element | Selection |
| type_text | Input |
| press_back | Navigation |
| start_app | System Action |
| restart_app | System Action |
| scroll_to_element | Navigation |

This table reflects the current runtime contract.

---

## 6. Lifecycle State Derivation

Lifecycle states are NOT explicitly emitted. They are inferred as follows:

### 6.1 Resolved
Inferred when:
- src/server accepts request
- action is validated and normalized
- action_id is assigned (or equivalent identifier exists)

---

### 6.2 Dispatched
Inferred when:
- control passes from src/server to src/interact
- execution call is issued to platform layer

---

### 6.3 Pending Verification
Inferred when:
- platform execution returns a result
- before any UI/state evaluation occurs

---

### 6.4 Verified / Failed
Inferred when:
- post-execution evaluation is performed (if available)

Rules:
- Verified = expected outcome observed in UI/state/log signals
- Failed = timeout, error, or mismatch in expected outcome

Where no formal verification exists, outcome is derived from best available signals (logs, UI diff, or absence of error).

---

## 7. Instrumentation Reality

There is no central instrumentation layer in the current system.

Instead:
- src/server emits partial logs during routing and validation
- src/interact emits execution logs and platform responses
- platform adapters may emit additional debugging information
- action envelopes now carry lightweight lifecycle metadata for post-dispatch state and source ownership

Lifecycle traceability is therefore assembled from distributed signals rather than a unified event system.

---

## 8. Module Responsibilities (Observed Behaviour)

### src/server
- receives action requests
- performs validation and normalization
- assigns identifiers where applicable
- routes actions to src/interact
- emits partial logs for request lifecycle

---

### src/interact
- executes platform-specific actions
- handles retries and fallback behaviours
- emits execution logs
- returns execution results
- may perform lightweight post-processing

---

## 9. Verification Reality

Verification is not a uniform system-wide layer.

It may occur via:
- UI state comparison (where available)
- log-based confirmation
- absence of error signals
- platform feedback

Verification outcomes are best-effort only where no formal verifier exists, and deterministic where reliable state signals or explicit evaluation paths are available.

---

## 10. Legacy and Special Actions

Actions such as:
- scroll_to_element
- start_app
- restart_app
- press_back

are fully supported in the runtime.

These actions:
- may bypass full lifecycle observability
- may not have explicit verification paths
- are interpreted using best-effort semantic mapping

---

## 11. Observability Model

Observability is currently distributed across:
- src/server logs
- src/interact logs
- platform debug output
- action envelope metadata

There is no unified event schema.

Lifecycle reconstruction requires correlation of:
- action_type
- timestamps
- execution boundaries
- error signals

---

## 12. Relationship to RFC 005

RFC 005 defines the ideal execution lifecycle semantics.

RFC 006 defines how those semantics are interpreted from the existing runtime system.

Together:
- RFC 005 = conceptual correctness model
- RFC 006 = runtime behavioural mapping layer

---

## 13. Summary

This RFC ensures:
- lifecycle semantics can be derived from current runtime behaviour
- existing action_type contract is preserved as source of truth
- no assumption of new instrumentation infrastructure is required
- real module responsibilities are accurately represented
- observability is understood as distributed rather than centralised
