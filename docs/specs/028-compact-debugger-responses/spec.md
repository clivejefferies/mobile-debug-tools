# Specification: compact debugger responses

[Approved intent](intent.md) · [Development process](../process.md)

Date: 2026-11-02. Status: accepted.
Source: [issue #82](https://github.com/clivejefferies/mobile-debug-tools/issues/82).
Intent approved by the maintainer with “yes” in this chat on 2026-11-02.

## Behaviour and compatibility

Add optional `responseMode: 'compact' | 'debug'` to all eleven existing debugger
tools. Omission defaults to `debug`, preserving the current response shape.
`debug` means the existing full response; do not introduce a separate `full`
alias. Mode selection applies to one call and never changes session state or
future defaults. Invalid modes return the existing `INVALID_ARGUMENT` error.
Input JSON schemas and strict runtime validation must agree.

Compact mode reduces repeated session metadata, not inspected application data.
It does not change breakpoints, suspension, stepping, locals, limits, event
delivery, timeouts, cancellation, cleanup or error classification. It must not
silently select compact output for existing clients.

## Exact response projection

Keep the current MCP text-content envelope and `isError` rules. JSON remains
formatted using the existing serializer; savings must come from omitted repeated
fields, not a whitespace-only change. Do not add a mode marker or rename fields.

For `get_debugger_capabilities`, `attach_debugger` and `get_debugger_state`,
compact and debug payloads are identical. These are explicit discovery and
session-baseline operations: callers need their resolved target, capabilities
and complete state. Clients can request state again to recover that baseline.

For the remaining eight tools, compact mode omits exactly these top-level fields
when the payload has a non-null `debug_session_id`:

- `device`
- `target`
- `capabilities`

Preserve every other field, including future fields unless separately specified.
In particular, retain `success`, `debug_session_id`, `state`, `captured_at_ms`,
`reason`, `stop`, `limitations`, `cleanup`, `error`, `execution_state`, `result`,
`breakpoints`, `events`, `next_cursor`, `overflow` and `timed_out` whenever present.
Do not prune nulls, empty collections or nested fields. Stack/frame/thread/stop
and breakpoint identifiers, locals metadata/truncation, pending breakpoints and
all event details therefore remain intact. Repeated stop information is retained
to make current execution state explicit.

Apply the same projection to success and failure payloads. A null-session
failure retains the existing complete payload, because no prior session baseline
can be assumed. A supplied but unknown session ID may be echoed as today; that
does not establish a valid session. `DEBUGGER_NOT_FOUND` remains explicit.
Neither mode may suppress diagnostics, error codes, retryability, limitations,
unknown execution outcomes or remaining cleanup resources. Diagnostic content
continues to use the bounded sanitized catalog introduced by #81.

## Lifecycle, safety and platforms

Projection occurs at the server response boundary after the existing operation
and error handling. It must not mutate session summaries, worker replies or
shared capability objects. Strip the presentation-only input before forwarding
command arguments to the session/Java worker. No Java protocol change is needed.

Device/process selection and session ownership are unchanged. A session ID
continues to identify the originally resolved Android target; omitting repeated
target metadata grants no ability to retarget it. Concurrency, deadlines,
cancellation and subprocess cleanup remain governed by existing contracts.
Detach must retain `execution_state: 'unknown'`, cleanup status and exact
remaining resources, including failed cleanup that requires a retry.

This covers the current Android debugger only. It adds no iOS support or new
prerequisites. Inspection still returns potentially private locals on request;
compact mode is not redaction. Do not persist real app values in benchmarks or
public artifacts. Use the isolated debugger fixture and synthetic failures.

## Acceptance and verification

1. All eleven registered tools accept both modes; omission and explicit `debug`
   preserve legacy output structure. Invalid mode values fail validation.
2. Compact output follows the exact omission rule, preserving all other values
   for success, paused/stale/unknown references, worker failure, timeout,
   cancellation and incomplete cleanup. Full discovery/state remains available.
3. Presentation does not alter command arguments, shared data, session lifecycle
   or device ownership. Existing debugger regression coverage remains passing.
4. Compare UTF-8 serialized MCP response bytes and parsed payload structure for
   the same isolated attach → breakpoint → stop → stack → locals → step →
   resume → detach journey. Project the same captured responses into both modes
   for a paired comparison; separately exercise actual compact calls through
   MCP. Report per-call/total bytes and percentage savings without a preset
   target. Retain real IDs/timestamps in measurement, publishing only safe
   aggregate results. Report unchanged discovery calls honestly.
5. Run `npm run verify`, applicable `npm run test:device` and a focused Android
   fixture journey against the updated build. Record server build and target;
   separate mocked checks, emulator results and physical-device/unrun coverage.
6. Update tool documentation, changelog and packaged usage guidance: default,
   exact omissions, baseline recovery through state/debug mode, and privacy and
   execution-state limitations. Check registration/runtime/plugin consistency.

Affected areas: debugger schemas/handler, a small response-projection helper,
unit and existing device fixture coverage, tool docs and packaged usage skill.
The main risk is accidentally hiding lifecycle or diagnostic evidence; an
explicit three-field omission rule and structural equality checks bound it.

## Approval

The maintainer accepted this complete specification with “yes” in this chat on
2026-11-02. Implementation is authorized within this scope.
