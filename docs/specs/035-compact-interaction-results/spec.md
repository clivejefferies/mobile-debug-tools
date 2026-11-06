# Specification: compact interaction results

Status: approved. Intent approved by the user's “ok” in
this chat on 2026-11-05; see [intent](intent.md). Source: issue #99.

## Behaviour and scope

Apply one compact projection after final evidence assembly to existing actionHandler
interactions (including lifecycle actions using that wrapper) and run_journey.
Keep responseMode defaults, inputs, execution, targeting, budgets, verification,
conditional-action protection and journey stop behaviour unchanged. Other tools,
including debugger and UI-tree observation output, retain their existing contracts.

Retain action_id, action_type, success, lifecycle_state, delivery_status,
dispatch_started, verification, failure_code/retryable when applicable, and total
elapsed time. No dispatch acknowledgement becomes verified success. Retain
verification-unavailable diagnostics and condition status/reason. Replace raw
condition observations, state_delta element arrays and repeated evidence metadata
with bounded summaries and a diagnostics reference. This intentionally changes
opt-in compact shapes; debug remains compatible. Update existing callers and
fixtures that inspect compact evidence, conditions or deltas.

Evidence retains session_id, correlation_id, action_id, device and linked trace_id
when present; action_id remains usable as actionRef with the evidence session ID.
Retain association failures/reasons where applicable. Readiness retains wakefulness,
lock_state, input_ready, blockers and limitations, omitting probe evidence entries.
Never infer input_ready=true from awake/unlocked or treat unknown as ready.

Add observed_state: status observed or unknown. Observed requires an actual
successful same-device post-dispatch observation; include kind, captured_at_ms,
freshness and snapshot session/revision when available. A precondition tree is
pre-action evidence, never resulting state. No observation, failed capture,
unknown timing, overlap or supersession must be represented conservatively with a
reason. Only fresh post-action evidence permits status observed; other cases use
unknown while retaining the evidence classification. Fingerprint evidence describes
an observation, not a named screen or proof of an intended outcome. State deltas
retain revision IDs, counts of added/removed/changed items, truncation and omitted
counts; detailed elements are retrieved separately. No new hierarchy read is added.

Journey retains success, stopped_at_step_id and every step's id/type/status/success,
reason for unrun steps and compact result. Preserve assertion outcomes, matched
counts and bounded actual-state summaries. Finalize shared light-verification
and child evidence before projection. Do not project a child twice or lose its
original diagnostics. Trace linking and cleanup remain unchanged.

## Bounds and diagnostics

Measure UTF-8 bytes of the final MCP text item after correlation and serialization,
not just an internal result. Caller-ID allowances count their UTF-8 JSON wire
encoding, including necessary escapes, so IDs are preserved verbatim. Each standalone compact result must fit 1,280 bytes
plus device-ID bytes. Each journey must fit 1,280 + 1,280 per supplied step, plus
UTF-8 bytes of supplied step IDs and device ID occurrences. Routine four-fixture
results must also reduce bytes by at least 20% each against the baseline below.
Report bytes and ceil(bytes/4) as a labelled token estimate, never actual tokens.

Use allowlists, bounded scalar strings (128 UTF-8 bytes per display value) and
count summaries; mark omitted display data with truncated=true. Preserve original
caller IDs, fixed outcome/status codes, all known blocker codes and correlation
references. If optional summaries would exceed the budget, omit them with
truncated=true and observed_state unknown when necessary; never silently drop
outcomes, blockers or diagnostics access. Test multibyte strings, huge trees,
conditions, deltas and all 50 journey steps. Debug output has no new output cap.

Add get_interaction_diagnostics({sessionId,resultId}), both UUID strings, strict
runtime validation and matching tool JSON schema. Every compact action/journey
and executed child result carries diagnostics {session_id,result_id,available}.
The lookup returns success:true and result containing the original diagnostic
payload and final full evidence, without replaying or observing the device.
Retain the pre-projection payload, including details already available internally
but previously omitted by compact mode; do not fabricate omitted debug captures.
Explicit debug mode remains the path for requesting additional diagnostic capture
at execution time. Lookup does not promise a debug rerun's additional observations.

Store at most 100 results, ten minutes from completion, and 16 MiB total in process
memory; cap each entry at 1 MiB. Serialize once and use oldest-completed eviction.
Oversized entries return available:false, reason:RESULT_TOO_LARGE in the compact
reference; never evict the useful summary. Lookup errors use success:false and
error {code,message}: SESSION_MISMATCH, RESULT_UNAVAILABLE (expired, evicted,
unknown or restarted), INVALID_ARGUMENT. No disk persistence, automatic retries,
subprocesses or device selection. Concurrent results receive unique IDs; reads do
not extend retention. Return explicit unavailability rather than rerunning input.

## Platform, failure and privacy

Projection is platform-neutral; preserve Android/iOS readiness unknown/unsupported
semantics. Route guarded failures and thrown errors through the same compact
boundary where these tools currently return errors, preserving MCP error signalling.
Timeouts retain uncertain delivery and retryability. Cancellation retains existing
execution semantics and never triggers replay; completed retained results expire
normally. No new permissions, device actions or native dependencies are introduced.

Diagnostic payloads may contain UI text, paths and errors. Retention is session-local,
bounded and nonpersistent; compact mode is not redaction. Do not log stored content
or expose unrelated sessions. Document expiry and that lookup is read-only.

## Acceptance and verification

1. Record baseline/projection sizes and field differences, including successful,
   failed, blocked, conditional, delta-heavy and journey cases.
2. Assert byte bounds on final serialized results and >=20% fixture reduction;
   check semantic fields, unknown observations and freshness independently.
3. Verify lookup fidelity, expiry, size rejection, eviction, session mismatch,
   concurrency, validation and absence of device calls or replay.
4. Verify registration/dispatch/schema parity, existing callers, debug compatibility,
   docs and plugin instructions together. Run npm run verify and test:device;
   inspect current CI for coverage differences during implementation planning.
5. Exercise updated local server on Android and a booted iOS simulator: dispatch-only,
   actual post-observation, failed/blocked action, journey and diagnostics lookup.
   Record build/device, evidence and cleanup. Native failure paths unsafe to induce
   use deterministic fixtures, labelled separately. iOS is currently unrun: listed
   simulators are shut down; boot one during implementation verification.

Affected areas: action-execution, correlation, journey, evidence assembly, new bounded
result store and diagnostics handler/schema/definition, tool dispatch, tests and docs.
Main risks are compact consumers relying on removed metadata, freshness mistakes,
projection before journey evidence finalization and unintended diagnostic retention.
The user approved this complete specification with “ok” in this chat on
2026-11-05; implementation within this scope is authorised.
