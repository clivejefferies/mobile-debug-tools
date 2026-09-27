


# RFC 012 — Action Trace and Execution Observability

## 1. Summary

This RFC defines a structured execution trace model for all actions within the MCP runtime. It provides visibility into resolution, execution, verification, stabilization, and recovery stages.

The goal is to make system behavior explainable, debuggable, and measurable without altering execution semantics.

---

## 2. Problem Statement

As the system has evolved (RFC 005–011), execution has become more reliable but also more opaque due to:

- stabilization loops masking transient failures
- recovery logic retrying actions without visibility
- multiple execution stages (resolve → execute → verify → stabilize → recover)

Current outputs provide final results but lack a structured explanation of how those results were reached.

---

## 3. Goals

This RFC introduces an execution trace model that MUST:

- provide a step-by-step record of action execution
- expose resolution, execution, verification, stabilization, and recovery stages
- remain deterministic and low-overhead
- be consistent across all tools and handlers

---

## 4. Non-Goals

This RFC does NOT define:

- external logging systems
- UI visualization layers
- distributed tracing infrastructure

It is strictly an in-process observability model.

---

## 5. Runtime Surfaces

Trace data MUST be emitted from:

- src/server (resolution)
- src/interact (execution and verification)
- stabilization layer (RFC 010)
- recovery layer (RFC 011)

All action flows MUST produce a trace.

---

## 6. Trace Model

### 6.1 ActionTrace

```ts
interface ActionTrace {
  action_id: string;
  steps: TraceStep[];
  final_outcome: "success" | "failure";
  attempts: number; // total execution attempts including recovery-triggered retries
}
```

### 6.2 TraceStep

```ts
interface TraceStep {
  stage: "resolve" | "execute" | "verify" | "stabilize" | "recover";
  timestamp: number;
  result: "success" | "failure" | "retry";
  attempt_index: number; // monotonic per action execution
  cycle_id?: number; // groups steps within a recovery cycle
  metadata?: Record<string, any>;
}
```

### 6.3 Partial Trace Requirements

For actions that do not traverse the full lifecycle (resolve → execute → verify → stabilize → recover), implementations MUST emit a partial trace.

A partial trace MUST:
- include a valid action_id
- include final_outcome
- include at least one TraceStep with a valid stage and timestamp

Partial traces MUST still respect attempt_index semantics.

This ensures observability coverage even for legacy or bypass execution paths.

---

## 7. Stage Emission Rules

### 7.1 Resolve Stage

- emitted by findElementHandler and related resolution logic
- includes selector, matched element, and confidence (if available)

### 7.2 Execute Stage

- emitted by action handlers (tap, type_text, scroll_to_element, etc.)
- represents the execution attempt

### 7.3 Verify Stage

- emitted by expect_* handlers
- reflects state validation results

### 7.4 Stabilize Stage

- emitted by RFC 010 stabilization logic
- includes stabilization attempts and convergence status

### 7.5 Recover Stage

- emitted by RFC 011 recovery logic
- includes strategy used and retry attempts

### 7.6 Step Emission Timing

Each stage MUST emit a TraceStep at the point where its outcome is determined:

- resolve: after target selection is finalized
- execute: after action handler completes (success or failure)
- verify: after verification result is computed
- stabilize: after stabilization loop completes (success or failure)
- recover: after a recovery attempt is decided and executed

Each retry or re-attempt MUST emit a separate step.

---

## 8. Deterministic Behavior

Trace emission MUST NOT:

- alter execution flow
- introduce timing side effects
- affect success/failure outcomes

It is strictly observational.

---

## 9. Minimal Metadata Contract

Implementations SHOULD include where available:

- selector or target identifier
- snapshot identifiers
- stabilization attempt counts
- recovery strategy name

Metadata MUST remain lightweight.

---

## 10. Integration with Existing RFCs

- RFC 006: execution emits execute stage
- RFC 007: resolution emits resolve stage
- RFC 010: stabilization emits stabilize stage
- RFC 011: recovery emits recover stage

### 10.1 Compatibility with RFC 006 Observability Model

RFC 006 defines traceability as being assembled from distributed signals rather than a centralized event system.

This RFC does NOT replace that model; it standardizes a unified projection layer over those signals.

- Existing emitters (server, interact, stabilization, recovery) remain the source of truth
- RFC 012 defines how those signals are composed into a single ActionTrace
- Actions that bypass parts of the lifecycle MUST still emit partial traces reflecting the stages they execute

This ensures backward compatibility while enabling a coherent trace surface.

---

## 11. Output Behavior

Trace MUST be produced for all action flows (full or partial, depending on runtime capability).

Canonical contract:
- Trace SHOULD be included in ActionExecutionResult when the runtime path supports full trace emission
- Trace MAY also be stored internally for diagnostics

If a runtime path cannot yet emit a full trace (e.g. legacy or bypass actions), it MUST emit a partial trace containing at least:
- action_id
- final_outcome
- at least one TraceStep representing the executed stage

Example:

```ts
interface ActionExecutionResult {
  success: boolean;
  failure_code?: string;
  trace?: ActionTrace; // optional in type, required by RFC behavior (full or partial)
}
```


Implementations MUST treat the absence of `trace` in the runtime type as a temporary compatibility constraint, not as an absence of trace generation. All execution paths MUST still generate a trace internally, even if only a partial trace is returned externally.

The optionality of `trace` in ActionExecutionResult is transitional. Implementations MUST treat the absence of `trace` as a compatibility constraint rather than a valid steady-state. Future versions of the runtime MAY require `trace` to be present on all ActionExecutionResult values once all execution paths support full trace emission.

---

## 12. Failure Analysis

Trace data MUST allow identification of:

- resolution failures
- execution failures
- verification mismatches
- stabilization convergence issues
- recovery attempts and outcomes

---

## 13. Success Metrics

- improved debuggability of failures
- reduced need for manual log inspection
- clearer differentiation between failure types

---

## 14. Summary

This RFC introduces a structured trace model that makes action execution transparent and debuggable. It builds on existing RFCs without changing behavior, enabling better diagnostics and future analytics capabilities.
