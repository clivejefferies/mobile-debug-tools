# Android system traces

[Documentation](../README.md) · [Tool reference](TOOLS.md)

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

## Capture workflow

Trace a reproducible slow or stalled interaction when existing UI timing/state
and logs leave a performance question unresolved. Check tool discovery first:
older installed servers may not expose these tools. Capability failure is a
reported limitation; it is not evidence that the app is frozen.

Establish the initial UI state and include an outcome assertion in the journey.
The launch-only example below demonstrates bracketing; it does not prove an app
outcome. Use a fresh screenshot or semantic assertion appropriate to the actual
screen. Settings, for example, may resume a subpage rather than show its main
title. Allow enough capture time for complete observations as well as inputs.

Always finalise an owned recording, including when a journey fails. Stop to keep
diagnostic evidence; cancel to discard it. Check both `state` and `cleanup`, and
use status/retry for an unresolved session before starting another capture.
Do not rely on automatic duration expiry as routine cleanup.

A useful report identifies the device, journey and assertion outcomes, trace ID,
linked correlation IDs, coverage, artifact path and cleanup outcome. `covered`
describes the capture session lifetime, not proof that every event survived the
ring buffer. Capture success and valid trace contents are separate from a
performance diagnosis. These tools do not return CPU summaries, frame metrics,
blocked-thread analysis or a root cause. Inspect the artifact with an available
analyser before making those claims; otherwise report analysis **unrun** and
provide the local artifact for follow-up. Host/device clocks remain unaligned.

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

## Related guides

- [Interaction](interact.md#interaction-execution-controls-rfc-018): run the journey being measured.
- [Evidence correlation](correlated-evidence.md): interpret action and observation timing.
- [Android runtime debugger](debugger.md): inspect paused application state.
