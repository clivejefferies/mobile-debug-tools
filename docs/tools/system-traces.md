# Android system traces

Use system traces to collect scheduling and system annotations around a slow
interaction. Capture is optional, device-wide and Android-only; it does not
automatically diagnose performance problems. No root or Android CLI installation
is required. The device must provide Perfetto (Android API 29+), authorised ADB,
tracing services, required sched/input categories, readable process identity,
base64 decoding and writable `/data/misc/perfetto-traces` storage.

## Tools

All inputs reject unknown fields. `platform` is `android` or `ios`; iOS is
unsupported and never starts capture. Optional `deviceId` uses existing device
resolution; supplying one is recommended when multiple devices are connected.

| Tool | Arguments | Result |
| --- | --- | --- |
| `get_system_trace_capabilities` | `platform`, `deviceId?` | `supported`, `backend`, resolved `device`, prerequisite booleans, reasons, enabled sources, unavailable categories, limitations. No recording. |
| `start_system_trace` | `platform`, `deviceId?`, `durationMs?` | Owned recording session after data-source acknowledgement. Duration is an integer 1,000–120,000 ms, default 30,000. |
| `get_system_trace_status` | `traceId` | Reconcile process/deadline and finalise ended recording. |
| `stop_system_trace` | `traceId` | Gracefully stop and retrieve local artifact; retry transfer/cleanup after failure. |
| `cancel_system_trace` | `traceId` | Stop and discard partial files. Already retrieved artifacts remain local. |

Trace control IDs are UUIDs and cannot redirect to another device. One capture
per device and four pending sessions per server are allowed. Pending failed
cleanup reserves its slot until resolved. Terminal records with complete cleanup
expire after 10 minutes or eviction beyond 100 records. Server restart invalidates
IDs. Repeated terminal operations return the stored outcome.

## Bracket a journey

1. `get_system_trace_capabilities({"platform":"android","deviceId":"emulator-5554"})`
2. `start_system_trace({"platform":"android","deviceId":"emulator-5554","durationMs":30000})`
3. Use the returned `trace_id` as `systemTraceId`:

```json
{
  "platform": "android",
  "deviceId": "emulator-5554",
  "systemTraceId": "<trace_id>",
  "steps": [
    { "id": "launch", "type": "start_app", "appId": "com.android.settings", "verificationMode": "none" }
  ]
}
```

4. `stop_system_trace({"traceId":"<trace_id>"})` returns `artifact.path` for local
   inspection in Perfetto. Delete the file/directory when finished.

An invalid, inactive, foreign-server or different-device reference prevents all
journey steps. A failed journey leaves the capture available to stop or cancel;
journeys do not control its lifetime. Without `systemTraceId`, journey behaviour
and evidence remain unchanged. Linked journey/step evidence has
`trace_context: {"supported":true,"trace_id":"…","markers":[]}`. The journey
returns `system_trace` with `trace_id`, `coverage` (`covered` or `partial` if
capture ended during execution), and `clock_alignment:"unknown"`. Trace results
list linked `correlation_ids`. These are associations, not injected markers or
proof of causality; host intervals are not aligned with device trace clocks.

## Session response and failures

JSON responses contain `trace_id`, process-scoped `session_id`, `device`,
`backend:"perfetto"`, `state` (starting/recording/stopping/completed/cancelled/failed),
nullable `reason` and `completion_reason`, host UTC capture bounds, nullable
`artifact`, `cleanup`, `correlation_ids`, `enabled_sources`, and
`unavailable_categories`. Capture bounds include command/acknowledgement latency.

`artifact` contains absolute `path`, `format:"perfetto"` and `size_bytes`.
`cleanup` contains `status` (pending/complete/failed) and `remaining_resources`.
Errors preserve known session metadata and set MCP `isError`. Argument/unknown-ID
errors return `{error:{tool,code,message}}` without a session. Codes include
`INVALID_ARGUMENT`, `UNSUPPORTED_PLATFORM`, `TRACE_UNSUPPORTED`, `TRACE_BUSY`,
`TRACE_NOT_FOUND`, `TRACE_START_FAILED`, `TRACE_STOP_FAILED`,
`TRACE_ARTIFACT_FAILED`, `ACTION_TIMEOUT`, and `TRACE_CANCELLED`.
Capability failures return ordinary `supported:false` responses with reasons.
Read state/cleanup independently: a successful artifact transfer can still have
failed device-file cleanup. Retry stop/status, or cancel to discard failed output.

## Limits and privacy

The fixed preset requests sched, freq, idle, am, wm, gfx, view and input categories,
a 16 MiB ring buffer and a 32 MiB maximum output. Missing optional categories are
reported; missing sched/input rejects start. No arbitrary config, wildcard app
annotations, heap, screenshot or logcat sources are enabled. Device/system
annotations may still contain sensitive information; this is not app-private data.

Capture has a device-side duration limit and a server finalisation timer. Start
acknowledgement has a 35-second budget, graceful stop 10 seconds, and transfer
30 seconds. Only the recorded PID/start-time/output-path owner can be signalled;
no kill-by-name cleanup. A device disconnect or uncertain stop reports failure,
never a successful artifact. Partial transfers are discarded; bounded device
output remains retryable. Successful transfers remove owned device files.

Host artifacts use unique restricted temporary directories and remain for
user-managed deletion. Nothing is uploaded or returned as base64. Normal server
shutdown attempts owned cleanup for up to 10 seconds. A server crash can leave
a uniquely named bounded device file for manual removal; restart performs no
broad cleanup sweep. Device suspend can extend Perfetto's own monotonic duration
limit; the server timer bounds wall-clock lifetime while the server is running.
