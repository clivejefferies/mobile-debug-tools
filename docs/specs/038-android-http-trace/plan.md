# Android emulator HTTP trace MVP implementation plan

The [intent](intent.md) and [specification](spec.md) were accepted on 2026-11-11.
The feasibility run verified app-local proxy and debug trust on one Android
emulator. Add a minimal owned debug fixture for MVP verification.

## Transport verification on 2026-11-11

**Rejected transport.** ADB 37.0.1 reverse mapping from `tcp:<port>` to a private host
Unix socket admitted a connection from the second emulator via the selected
emulator's Wi-Fi IP. The second emulator received the synthetic reply. The
same probe was refused via its own loopback and the host gateway. The host
had no matching TCP listener. Removing the mapping made the selected
emulator's loopback probe fail as expected.

ADB rejected `tcp:127.0.0.1:<port>` with `Invalid source port`. A reverse
mapping to a temporary filesystem socket on the emulator also failed with
`cannot bind listener: Permission denied` on the stock API 36 image. One
earlier probe using dynamic port allocation recorded a fatal ADB
`disallowed connect` error and a daemon restart. Later fixed-port runs
reached the Unix socket consistently and reproduced the Wi-Fi exposure.

Evidence used Node 23.11.0, Android Emulator 37.2.13.0 and two API 36
Google Play ARM64 guests (`emulator-5554` and disposable `emulator-5562`).
The exploratory probe used a synthetic responder and checked host IPv4
addresses and the target's guest IPv4 addresses. It failed the Wi-Fi probe.
The check ran independently of MCP and the app.

`npm run verify` passed. The disposable emulator and its temporary AVD were
removed, and the original emulator had no remaining probe mapping. The
general device suite was not run because this change adds only a manual
transport probe and does not change server behavior.

**Loopback relay prototype passed.** On the same emulator and ADB versions,
`adb -s emulator-5554 shell -T 'toybox nc -s 127.0.0.1 -l -p 48164'`
provided a bidirectional byte stream without an ADB reverse mapping or a host
TCP listener. Guest `netstat` showed `127.0.0.1:48164` in `LISTEN`. The
selected emulator sent a synthetic marker and received the reply through
the host process's ADB stdin and stdout. The second emulator was refused on
its own loopback, the host gateway, and both target guest IPv4 addresses.
The host was refused on its loopback and non-loopback IPv4 addresses.
Stopping a fresh idle relay by its guest PID closed the port and the target
then reported connection refused.

**Concurrent HTTPS relay prototype passed.** An Android Java helper built
with `javac` and SDK build-tools 36.0.0 `d8` accepted connections on guest
`127.0.0.1:48165`. It multiplexed them over one selected-device `adb shell -T`
stream. A Node host bridge opened one private Unix socket connection per
guest connection. The isolated Mockttp 4.6.5 copy had an experimental change
to call `server.listen(socketPath)` in place of `server.listen(port)`. Its
reported address was the private socket path.

On the stock API 36 target, an Android Java client used HTTP CONNECT and
verified TLS against a test CA and the `trace.test` hostname. Mockttp returned
synthetic HTTP 200 responses. The first two response handlers waited for both
requests to arrive, proving overlap. A third request completed over a new
connection. The second emulator and both host IPv4 probes were refused. With
a fourth client socket open, killing the host ADB subprocess closed the
guest listener, the client connection and its host Unix socket connection.
The harness then stopped the backend and removed the temporary guest files.

Mockttp's public API still needs a maintainable private listener option, or
the MVP needs an equivalent backend. The relay spike used local mock replies.
Interrupted MCP server cleanup and the two-app workflow remain unverified.

## Bounded relay implementation on 2026-11-12

The [Android relay](../../../src/observe/http-trace/java/HttpTraceRelay.java)
binds guest IPv4 loopback. Its framed ADB stream uses
connection IDs, directional EOF and close messages, up to eight live
connections, and 8 KiB payloads. It bounds each guest write queue and closes
idle sockets. The [host bridge](../../../src/observe/http-trace/relay.ts)
pauses reads under backpressure, bounds ADB writes and closes the trace-owned
Unix connections on stream termination. It retains no traffic after delivery.

The [manual relay check](../../../test/device/manual/http-trace/relay-confinement.ts)
passed on API 36 `emulator-5554` and disposable `emulator-5562` with a
synthetic Unix-socket backend. It checked the exact guest loopback bind, host
and second-emulator refusal, two overlapping requests, a 256 KiB response,
and closure of an active client and the guest listener after killing ADB.
The relay DEX and disposable AVD were removed. The framing unit test passed.

The Android forwarding check below also passed with the bounded relay in
place of the prototype bridge. The API 36 fixture received 200 from a real
local HTTPS origin, 403 for an excluded host, and 502 for each upstream TLS
failure. The harness removed the app and relay and confirmed the port was
closed.

Mockttp 4.6.5 is still the published version, and the upstream HEAD checked
on 2026-11-12 was still `0dc5f31`. Integrating the production backend and MCP
lifecycle depends on obtaining a maintained build with private socket support.

`npm run verify` passed on retry with the disposable emulator stopped. The
initial run timed out in the existing `interact/tap_element.test.ts` check.
`npm run test:device` stopped when ADB reported a device offline during the
Android screenshot smoke test. That test passed on a focused retry with the
emulator online. The remainder of the general device suite was unrun.

## Mockttp listener and upstream forwarding

**Local draft passed.** A temporary upstream checkout at `0dc5f31` built
with a Node-only `getLocal({ unixSocketPath })` option. Four focused tests
passed for HTTP over the socket, socket removal, collision ownership,
invalid options and default TCP startup. The draft rejects an explicit TCP
port in Unix mode and leaves the TCP-specific `port` and `url` accessors
unavailable for a Unix listener. The draft has not been submitted upstream.

A host-side probe using the compiled draft opened HTTP CONNECT over the
Unix socket and received HTTP 200 and the expected body from a real local
HTTPS upstream. A fallback rule returned HTTP 403 for a non-allowlisted
hostname and plaintext HTTP. The allowlist matched the actual upstream
`request.destination.hostname`. An untrusted certificate and a trusted
certificate with the wrong hostname each produced an upstream TLS attempt
and zero upstream HTTP requests. The test-specific trust roots were supplied
with `additionalTrustedCAs` and certificate verification remained enabled.

Mockttp printed raw TLS failure details to its process diagnostics even with
debugging disabled. The production integration must keep those diagnostics
out of MCP logs and results and emit bounded failure classifications.

**Android forwarding check passed.** On API 36 `emulator-5554`, the opted-in
fixture loaded a session file through `run-as` and made HTTPS requests over
guest loopback, the multiplexed ADB relay and the Unix listener from the
compiled Mockttp draft. The test rule checked the actual destination hostname
and forwarded eligible requests to a controlled loopback HTTPS origin. The
app received HTTP 200 and the origin recorded one HTTP request. A rule that
excluded the fixture hostname returned HTTP 403 with zero additional origin
connections. An untrusted origin certificate and a trusted certificate with
the wrong hostname each returned HTTP 502, with one TLS connection attempt
and zero HTTP requests at each origin. Removing the session file selected
normal routing. The test uninstalled the fixture, removed the guest relay
files and verified that the relay port refused connections.

The Android harness supplied the local origin explicitly and used the local
Mockttp draft. The later MCP verification below used native passthrough.

## Automatic app setup feasibility

On API 36 `emulator-5554`, `adb shell -T run-as dev.mobiledebugmcp.debugfixture
pwd` reached the private directory of a freshly built, debuggable repository
fixture. `run-as` rejected the installed non-debuggable tree bridge. The
fixture was uninstalled and its temporary build removed. These were read-only
checks of the delivery prerequisite.

The [accepted amendment](spec.md#amendment-for-automatic-debug-app-setup)
adds opt-in app configuration. Validate the file contract on a repository-owned
debug fixture using explicit ADB targeting before wiring `appId` into MCP.
Use the private Unix socket proxy prototype to test HTTPS separately from
MCP registration. Exercise missing, malformed, active, expired and removed
files in one running app. Rotate the public CA across two proxy sessions.
After choosing the supported backend, add server-side validation, atomic
publication, rollback and cleanup, then exercise both owned apps through MCP.

**Fixture check passed.** On `emulator-5554` (API 36), the
[HTTP trace fixture](../../../test/fixtures/http-trace-app/README.md) started
once and published its opt-in marker. A host harness used device-scoped
`run-as` to stage and rename each session file. The app received HTTPS 200
and 202 from two instances of the private Mockttp prototype using different
CAs. The stale CA failed with `SSLHandshakeException`. Missing, malformed,
ambiguous, removed and expired configuration selected the normal route. The
PID stayed the same and an unrelated private file was preserved. The fixture
and relay were removed after the check.

The fixture reports its fallback route without making an external request.
The test used mock responses and manual file delivery. MCP rollback, pinning
and upstream verification remain unrun.

`npm run verify` passed. `npm run test:device` passed the Android correlated
evidence check, then stopped at iOS correlated log capture. A direct `simctl`
log query reproduced the simulator's local log-store error. The tests after
that failure were unrun.

## MCP integration on 2026-11-12

The [trace tools](../../tools/http-trace.md) work in a source checkout with an
explicit local Mockttp build and compiled relay. The worker probes Unix-socket
support before startup, validates its bound address, discards backend console
output and sends only bounded metadata to MCP. The tool list hides this feature
without opt-in backend and relay paths. The relay now reserves a fixed guest
loopback port so a second server process cannot start a parallel trace.

The [MCP device smoke](../../../test/device/automated/observe/http-trace.smoke.ts)
passed on API 36 `emulator-5554` with Node 23.11.0, ADB 37.0.1, a local build
from base `d5e3247`, and Mockttp 4.6.5 with the local listener draft from
`0dc5f31`. It installed two separately packaged owned debug apps, one using
`HttpsURLConnection` and one using CONNECT and `SSLSocket`. Both received
HTTP 200 from a controlled upstream and produced matching redacted records.
The first also verified rejection of an untrusted origin, app opt-in,
cross-process conflict, cross-session ID isolation, paging, repeated stop,
normal routing after cleanup and cleanup on MCP disconnect. Both packages
and their relay files were removed. Unit checks cover cursor scope, eviction,
relay framing and refusal to start an unpatched backend.

Published backend support depends on [Mockttp PR #233](https://github.com/httptoolkit/mockttp/pull/233).
The npm archive now includes the
Android relay at `assets/http-trace-relay.dex`, and the runtime uses that
asset by default. An independent build matched the bundled DEX byte for byte.
The optional relay path remains available for development. Application
pinning verification is deferred at Clive's request.

The smoke forces a partial cleanup by placing a directory at the fixture's
owned trace file path. The first stop returns incomplete. After removing the
directory, a second stop with the same trace ID completes cleanup and
subsequent stops return the retained result. Set `MCP_HTTP_TRACE_TEST_EXPIRY=1`
to also exercise the full five-minute lifetime on a disposable fixture.

The five-minute smoke passed on `emulator-5554`. The trace returned
`HTTP_TRACE_EXPIRED`, the app returned to normal routing, and the trace
configuration was gone. A subsequent stop returned a completed expiry
result. `npm run verify` also passed after bundling the relay.

Both Android apps passed the MCP smoke against an isolated installation from
the local npm archives, with the relay override unset. The Mockttp archive
was built from the private-listener draft. The public npm registry still
reported stock Mockttp 4.6.5 on 2026-11-12.

`npm run verify` passed. The general device suite stopped on the existing iOS correlated-log check
because the simulator could not open its local log store. The focused
Android MCP smoke ran separately and passed.

A rerun with a fresh iPhone 17 Pro simulator on the same iOS 26.4.1 runtime
passed correlated evidence, log capture, screenshots and UI trees on iOS.
Android HTTPS tracing passed again on both fixtures. The suite stopped at
the optional iOS Time Profiler smoke. Direct retries verified recording,
sample export, cancel, expiry and shutdown cleanup. The loader journey
failed at input with the default idb companion and at the final `Done`
assertion with the documented isolated companion. Android Perfetto passed
in a separate run. The temporary fixtures and isolated companion were removed.

The iOS Time Profiler smoke then passed on the fresh simulator with Meta's
official idb companion 1.7.8. The same MCP selector tap reached `Done`, the
export contained 46 CPU sample rows, and cancel, expiry and shutdown cleanup
passed. The fixture, test companion process, socket and trace artifacts were
removed. The test used an explicit companion socket and did not change the
host's default companion. See the [iOS setup](../../tools/system-traces.md#ios-simulator-instruments-capture).

## Implementation order

1. Select a supported private listener for the backend and turn the relay
   prototype into an owned, bounded transport. Repeat the confinement and
   cleanup checks against that implementation before registering the tools.
2. Add the owned trace lifecycle under `src/observe/` and reuse explicit Android
   device resolution. Verify the target before acquiring resources. Make start
   atomic per emulator and stop idempotent. Own the ADB relay, listener and
   app configuration created for that trace. Keep request, startup, inactivity and cleanup
   deadlines finite. Preserve a bounded terminal cleanup result.
3. Add request capture and bounded in-memory retention. Enforce the exact host
   allowlist before forwarding and preserve upstream TLS validation. Reduce
   events to the specified metadata before retention. Cover paging, eviction,
   transport failures and expiry without persisting raw traffic.
4. Register `start_http_trace`, `read_http_trace` and `stop_http_trace` through
   the existing server definitions and handlers. Update tool documentation and
   the compatibility fixture. Document app-local setup, trace readiness and
   cleanup behavior. Keep the log-based network tool independent.
5. Run the complete MCP workflow on the MVP fixture and a second
   owned debug app. Record the server revision and build, app builds,
   emulator images, Mockttp and ADB versions, sanitized outcomes, and
   cleanup results.

## Prerequisites and commands

Use Node 22 or later, ADB 37.0.1, SDK platform and build tools 36, and two
dedicated Android API 36 emulators. Local Node 23.11.0 and ADB 37.0.1 are
available. A disposable second AVD covered the confinement checks. Use an
existing owned debug app for the second app journey if available. A second
repository-owned debug fixture with a distinct HTTP client is the fallback.
Use a controlled HTTPS endpoint and synthetic data.

The relay framing test, manual confinement check and MCP smoke check exist.

```sh
node --import tsx test/unit/observe/http-trace-relay.test.ts
ANDROID_TRACE_TARGET="$ANDROID_EMULATOR_ID" ANDROID_TRACE_OTHER="$OTHER_EMULATOR_ID" \
  node --import tsx test/device/manual/http-trace/relay-confinement.ts
ANDROID_TRACE_TARGET="$ANDROID_EMULATOR_ID" \
  MCP_HTTP_TRACE_MOCKTTP_MODULE="$PRIVATE_MOCKTTP_ENTRY" \
  node --import tsx test/device/automated/observe/http-trace.smoke.ts
npm run verify
npm run test:device
git diff --check
```

## Verification matrix

| Criterion | Check |
| --- | --- |
| Virtual target only | Attempt unsupported and ambiguous targets with fake discovery. Assert that validation precedes listener, certificate and relay creation. |
| Confinement | On two dedicated emulators, observe a successful request from the selected target and connection failure from the other target. Probe from a non-loopback host client and verify that the backend has no exposed TCP listener. Confirm relay removal and repeat the probes after stop. |
| Real app workflow | Start a trace through MCP, trigger the expected exchange on each owned debug app, read matching metadata, then stop. Record first-use steps and failure evidence for any blocked app. |
| Forwarding and privacy | Use a controlled trusted upstream and an invalid-certificate upstream. Assert that the latter and non-allowlisted destinations fail. Verify bounded paging, eviction, and the absence of synthetic secrets in records and errors. |
| Ownership and recovery | Exercise overlapping starts, repeated stops, disconnect, interruption, expiry, and partial cleanup. Confirm removal of run-owned relays, listeners, app configuration and keys while preserving unrelated resources. |
