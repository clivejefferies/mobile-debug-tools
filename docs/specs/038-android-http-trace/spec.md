# Android emulator HTTP trace MVP specification

Status: Accepted on 2026-11-11. Clive replied “ok” to the proposed MVP specification.
See the [accepted intent](intent.md).

## Workflow

A developer configures an owned Android debug app to route requests through a
trace proxy and trust the trace CA for the debug client. The app must retain
normal TLS and hostname validation. A client whose pinning or routing policy
is incompatible stays outside the trace. The tool does not modify device-wide
proxy settings, the device trust store, application files, or release settings.

The MCP client starts a trace for a selected emulator, uses existing tools to
interact with the app, reads the collected metadata, then stops the trace.
Mockttp is the proposed backend. The feasibility fixture demonstrated HTTPS
capture with app-local configuration. It did not establish production listener
confinement, second-app compatibility, or general destination forwarding.
Verify those properties before advertising the capability.

## Proposed MCP contract

- `start_http_trace` requires an explicit Android emulator `deviceId` and a
  nonempty list of exact HTTPS destination hostnames the developer intends
  to trace. The result includes `traceId`, emulator identity, the app-local
  proxy address, public CA material, expiry, and readiness. A listening proxy
  is ready for setup, while a captured allowed HTTPS exchange establishes
  that the configured client is working.
- `read_http_trace` requires `traceId` and accepts an opaque cursor and bounded
  page size. It returns ordered request records, the next cursor, and an
  explicit indication of any records evicted before the requested cursor.
  Each record includes method, allowed destination host, response status or
  transport failure classification, capture time, and elapsed milliseconds
  where observed. Host-only URL reporting omits paths, query strings,
  fragments, and credentials. Records describe traffic seen by the proxy.
  Timing can help correlate with app actions. It cannot establish causation
  or app identity.
- `stop_http_trace` requires `traceId` and reports whether listener and
  session resources were cleaned up. Repeated stops return the terminal
  outcome while it is retained. A partial cleanup failure remains visible
  and retryable.

All trace IDs are scoped to the originating MCP server session. Errors identify
invalid targets and destinations, conflicts, expired or unknown traces,
unavailable transport, and incomplete cleanup without echoing raw traffic or
keys. Existing log-based `get_network_activity` behavior is preserved.

## Isolation and lifecycle

Confirm that the exact target is a running Android emulator before creating
trace resources. Allow one trace per emulator. Fail closed if transport
confinement cannot be established. Require both host-only listener exposure
and scoped access from the selected emulator. Verify that another emulator or
a non-loopback host client cannot use the trace. The feasibility listener's
default bind behavior does not satisfy this acceptance criterion.

Only explicitly allowed HTTPS destinations can pass through the proxy. Reject
other destinations before forwarding. Never relax upstream TLS verification.
Keep CA private keys inside the session. Store sanitized metadata in a bounded
in-memory buffer and discard it at expiry. Exclude headers, bodies, raw URLs,
and secret-bearing diagnostics from tool responses and retained state. Set
finite setup, request, idle, and cleanup deadlines. On failure, cancellation,
disconnect, or expiry, close owned sockets and remove owned transport and
certificate resources. Preserve a bounded cleanup outcome for retry or
diagnosis.

## Acceptance

1. Start, read, and stop a real trace through MCP on an owned debug fixture and a
   second owned debug app. Each app receives an expected HTTPS response and the
   trace shows matching redacted metadata.
2. Demonstrate that unsupported devices are rejected before setup and that
   an unrelated host client or second emulator cannot use the listener.
3. Verify blocked destinations, upstream TLS failures, bounded retention,
   redaction, and session isolation. Use synthetic secret markers to check
   that no raw data is retained.
4. Verify successful, repeated, interrupted, and expiry cleanup. If confinement
   or second-app validation cannot be demonstrated, record the specific
   blocker before making the capability available.

## Amendment for automatic debug app setup

Status: Accepted on 2026-11-11. Clive replied “ok” to the request to approve
writing and removing a session file inside an explicitly opted-in debug app.
The fixture will validate the opt-in contract before the feature is offered to
app developers. Manual setup remains available.

- Add an optional `appId` to `start_http_trace`. It identifies a single installed
  Android package on the selected emulator. Validate that the package is
  debuggable and has opted in to the supported configuration version before
  acquiring trace resources. An uninstalled or ineligible package fails with a
  setup error. Omitting `appId` selects manual setup.
- The developer adds a debug-only integration to the app's HTTP client. The
  integration opts in by creating a version marker in a documented private
  app directory. It reads the trace configuration at runtime before selecting
  the HTTP client for a request, so a new trace needs no rebuild or relaunch
  once the integration has initialized. The release build excludes this code.
- With explicit `appId`, the server uses device-scoped `adb shell -T` and
  `run-as` to atomically publish an owned session file in that directory.
  The file contains the version, trace ID, guest loopback proxy address,
  public CA certificate, destination allowlist and expiry. Its name is unique
  to the trace. The app rejects invalid, expired or ambiguous configurations
  and uses its normal client in those cases. The CA key stays with the proxy.
- The app uses a separate trace client only for matching HTTPS destinations.
  Preserve existing hostname verification and certificate pinning. A pinned
  destination whose chain is incompatible with the trace CA stays ineligible.
  This amendment authorizes writes only to the trace-owned configuration file
  and its atomic staging file inside the opted-in app's private storage.
- Start reports successful configuration delivery separately from observed
  HTTPS readiness. Failed setup rolls back the trace and reports incomplete
  rollback if any resource cannot be removed. Stop and expiry delete only the
  owned file. Before each new request the app checks for removal or expiry,
  retires the trace client and uses normal routing. An expired file cannot
  reactivate the trace if the server disappears or the emulator disconnects.

On an owned fixture, verify that trace start configures a running app, an
allowed HTTPS request appears in the trace, and a second trace can start with
a fresh CA without rebuilding. Verify normal routing after stop and expiry,
failed setup rollback, rejection of unopted or release packages, preservation
of unrelated app files, and an incompatible pinned destination. Keep the
existing two-app, isolation and upstream TLS acceptance checks.
