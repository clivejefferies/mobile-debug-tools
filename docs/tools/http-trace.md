# Android emulator HTTPS tracing

This feature traces request metadata from an owned, explicitly configured
Android debug app. The tools are advertised when the MCP process is configured
with `MCP_HTTP_TRACE_MOCKTTP_MODULE`, an absolute path to the tested Mockttp build
with the Node-only `getLocal({ unixSocketPath })` option. Published Mockttp 4.6.5
lacks that option.

The npm package includes the compiled Android relay. Set the optional
`MCP_HTTP_TRACE_RELAY_DEX` to an absolute path to test a different build.
Maintainers can regenerate the bundled relay with JDK 17 or 21, SDK platform 36
and build-tools 36.0.0 from the repository root.

```sh
node --import tsx --input-type=module <<'JS'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { buildRelay } from './test/fixtures/http-trace-app/build-relay.ts'
const directory = mkdtempSync('/tmp/mdm-ht-relay-')
try { copyFileSync(buildRelay(directory), 'assets/http-trace-relay.dex') }
finally { rmSync(directory, { recursive: true, force: true }) }
JS
```

From a source checkout, build the MCP server with `npm run build`. Start it with
the backend path set. Start will return `HTTP_TRACE_TRANSPORT_UNAVAILABLE` if the
backend cannot bind privately. The relay binds `127.0.0.1:48165` inside the
selected emulator and talks to the proxy over ADB and an owned host Unix
socket. A port collision prevents a second trace on that emulator.

## Start, read, and stop

- `start_http_trace` requires `deviceId` and `allowedHosts`. Use an explicit
  booted emulator serial and exact HTTPS hostnames. An optional `appId`
  delivers configuration to a debuggable package with the version 1 opt-in
  marker. The response includes `traceId`, `proxyHost`, `proxyPort`,
  `caCertificate`, `expiresAt`, and `appConfigured`. A listening trace is ready
  for client setup.
- `read_http_trace` takes `traceId`, an optional opaque `cursor`, and an
  optional `pageSize` from 1 to 100 (default 50). It returns at most that
  many records, `nextCursor`, an `evicted` count and readiness. Records
  contain method, host, capture time and elapsed time, plus HTTP status or a
  transport failure. The server keeps up to 256 records in memory.
- `stop_http_trace` takes `traceId` and returns `cleanedUp` and a reason.
  Repeated stops return the retained terminal result. Retry an incomplete
  cleanup with the same trace ID. Traces expire after five minutes.
  Trace identifiers and cursors belong to the MCP session that created them.

For automatic setup, the app's debug integration creates
`files/http-trace/version` with the value `1` in private storage. MCP writes a
trace-owned JSON file atomically in that directory. The app reads it at runtime
and restores normal routing when the file is removed or expires. See the
[owned fixture](../../test/fixtures/http-trace-app/README.md) for the file format.

Without `appId`, configure the app's debug HTTP client with the returned proxy
address and public CA. Keep normal hostname verification and application pins
in effect. Only traffic routed through the proxy can be observed, and records
do not establish app identity. The proxy preserves upstream certificate
validation. Headers, bodies, paths and query strings are excluded from trace
results. Log-based [network activity](observe.md) remains available.
