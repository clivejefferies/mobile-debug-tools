# Specification: debugger failure diagnostics

[Intent](intent.md) · [Development process](../process.md)

Date: 2026-11-02. Status: accepted by the maintainer with “ok” in this chat on 2026-11-02.
Intent approved by the maintainer with “looks good” in this chat on 2026-11-02.
Source: [issue #81](https://github.com/clivejefferies/mobile-debug-tools/issues/81).

## Outcome and scope

Existing Android debugger tools will explain failed operations using bounded,
sanitized evidence. Diagnostics distinguish the operation stage from its known
failure reason; they do not claim to determine the cause of issue #80.

All eleven debugger tool names, input schemas, defaults, deadlines, error codes,
`error.message`, `error.retryable`, MCP `isError` behavior, and successful debug
payloads remain compatible. No opt-in argument is needed. iOS remains unsupported;
these diagnostic concepts may be reused by a future backend. Compact responses,
new debugging capabilities and automatic retries are excluded.

## Additive response contract

A debugger failure carries `error.diagnostic` with exactly these fields:

| Field | Values and meaning |
| --- | --- |
| `stage` | `prerequisite`, `compilation`, `worker_start`, `ipc`, `target_resolution`, `forwarding`, `attach`, `command`, `transport`, `cleanup`, `unknown` |
| `reason` | `unavailable`, `unsupported`, `spawn_failed`, `process_exited`, `invalid_message`, `message_limit`, `write_failed`, `connection_refused`, `transport_lost`, `timeout`, `cancelled`, `operation_failed`, `unknown` |
| `recovery` | Fixed guidance from the stage/reason catalog, at most 240 ASCII characters |

No additional free-text details, paths, command arguments, identifiers, exception
classes, stderr excerpts or numeric process metadata enter this object. Its
serialized UTF-8 size must not exceed 512 bytes. Existing targeting fields remain
the source of device/process identity. Unknown evidence produces `unknown`, not
a guessed cause. Ordinary argument, stale-reference and pause/state validation
errors need not gain diagnostics.

`get_debugger_capabilities` retains its successful probe envelope, `supported`
and `reasons`. When probes fail, an optional top-level `diagnostics` array contains
at most two diagnostic objects in JDK-then-target probe order. It is absent when
both probes succeed. It does not turn an unsupported probe into an MCP error.

Failed attach and command responses, thrown errors handled by the MCP wrapper,
and terminal `get_debugger_state` failures preserve the applicable diagnostic.
Asynchronous worker failure/disconnection retains one diagnostic in the owning
session until normal terminal-summary pruning. Diagnostic state is separate from
inspection data, which cleanup continues to clear. Event polling retains existing
cursor, overflow and event semantics; no new event type is introduced.

## Classification and uncertainty

Classification uses host operation context, structured child-process error codes,
validated worker fields and known Java exception types. Raw message matching is
not a diagnostic source. The Java bridge supplies only allowlisted diagnostic
values; the TypeScript boundary validates and reconstructs them, dropping unknown
fields. Malformed diagnostic values are a protocol failure, without echoing input.

JDK discovery/version checks use `prerequisite`; source/cache preparation and
`javac` use `compilation`; spawn errors use `worker_start/spawn_failed`.
Unexpected child exit uses `worker_start/process_exited` before the first valid
worker reply, otherwise `ipc/process_exited`; this is a phase convention, not
proof that startup succeeded or failed. Malformed/oversized IPC and stdin write
errors use `ipc` with the corresponding fixed reason. JDI attach refusal uses
`attach/connection_refused` only with an explicit connection-refused exception;
other attach exceptions use `attach/operation_failed`. Structured transport loss
uses `transport/transport_lost`; unclassified exceptions use the known stage and
`unknown`. Target discovery and ADB forwarding retain distinct stages.

Timeout/cancellation keeps the stage active when observed and uses `timeout` or
`cancelled`; it does not imply that the command was never dispatched. An operation
that never started may use `unknown`. Preserve the first causal failure across
the worker-event/rejected-request race. Cleanup must not replace it with a
secondary EOF or exit failure. If the existing error code reports cleanup failure,
its diagnostic is `cleanup/operation_failed`; original session reason and
`cleanup.remaining_resources` remain available under their existing contracts.

## Recovery, ownership and privacy

Guidance is a static catalog: check JDK 17+/javac for prerequisites; check the
compiler/toolchain for compilation; check worker launch availability for startup;
inspect session state and detach before a fresh attach for IPC/transport failure;
check the explicit running debuggable target and debugger contention for attach.
Timeout/cancellation guidance states that execution may be uncertain and requires
state/cleanup inspection before another state-changing command. Cleanup guidance
requests retrying `detach_debugger` and checking remaining resources. Unknown
failures direct clients to session state and cleanup without claiming a cause.

Existing per-device ownership, four-session limit, serialization, pause guards,
reference invalidation, independent cleanup budget, expiry and shutdown rules
remain unchanged. Never kill the target app/ADB server, remove unrelated forwards,
retry attach/step/resume automatically, or claim resumed execution after loss.
Retain bounded subprocess/IPC handling and drain stderr without retaining it.
No new logging, persistence, telemetry, UI capture or collection of app values.

## Acceptance and verification

1. Deterministic checks distinguish prerequisite/compile/startup, malformed and
   oversized IPC, write/exit, attach and transport failures without changing codes.
2. Unknown exceptions and hostile protocol/error text cannot expose secrets,
   locals, paths or raw output in diagnostics, responses or new logging.
3. Timeout/cancellation preserve deadlines and session policy; races, concurrent
   sessions, cleanup failure/retry and shutdown preserve owned resources and the
   appropriate diagnostic. Terminal summaries retain sanitized failure evidence.
4. MCP serialization and capability probes satisfy the additive contract and
   bounds; successful payloads and validation/reference errors remain compatible.
5. Run `npm run verify`, `npm run test:device`, and the explicitly selected Android
   fixture journey against the updated server: attach, breakpoint, stop, stack,
   known locals, step/resume, detach and forward-ownership checks. Record server
   fingerprint and target; distinguish emulator from physical-device evidence.
6. Update tool documentation, changelog and usage skill with fields, recovery,
   uncertainty and platform limits; keep packaged skill copies consistent.

Current investigation inspected worker, Java bridge, protocol, sessions, MCP
handler, tool docs and existing unit/device fixtures at checkout
`803409a7a784669b68844e8af5b21cd822ffd599`. ADB 37.0.1 is installed, but the
sandbox prevented its daemon from binding port 5037 (`Operation not permitted`).
No live device baseline or new behavior is verified. Implementation verification
must retry device discovery with appropriate execution access; unavailable device
coverage must be reported as blocked, with the fixture command documented.

## Affected areas, risks and approval

Changes are expected in `src/debugger/{worker,protocol,sessions,android}.ts`,
`src/debugger/java/DebuggerWorker.java`, the debugger MCP handler, focused tests,
tool documentation and usage skill. Reuse existing typed error/budget machinery;
extract cohesive diagnostic helpers where structural limits require it. Main
risks are losing diagnostics during wrapping, race-dependent attribution and
accidental private-data propagation. Boundary and lifecycle checks address them.

Accepted decisions: always-additive failure diagnostics,
the fixed schema/catalog above, capability-probe diagnostics, and sanitized
terminal-session retention. The maintainer accepted this complete specification with “ok” on 2026-11-02;
implementation is authorized within this scope.
