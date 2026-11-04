# iOS tracing investigation

2026-11-04. Native CLI feasibility only; no new MCP behaviour implemented.
Xcode 27.2 (27B52), Instruments 27.2; iPhone 17 Pro simulator, iOS 26.4.1,
UDID `F9243BAF-62A8-4990-8A99-17F527F56FDA`.

`xcrun xctrace help record`, `help export`, `list templates`, `list devices`,
and `record --template 'Time Profiler' --device <UDID>
--show-recording-options` were inspected. Listing required execution outside
the workspace sandbox because Instruments writes its normal cache. No physical
iOS device was listed. No permission bypass or `--no-prompt` was used.

The existing `test/fixtures/readiness-app` was built, installed and launched on
the explicitly selected simulator. It was previously shut down. Three-second
recordings used `record --template <name> --device <UDID> --attach Readiness
--time-limit 3s --output <unique local path>`. Initial PID attachment failed
with “Cannot find process”; later name attachment resolved fixture PID 22313.
This argues for exact app identity resolution and fail-closed readiness, not
blind PID/name retries. No journey or UI assertion ran during these probes.

| Template | Result | Artifact validation |
| --- | --- | --- |
| Time Profiler | exit 0 | TOC confirms simulator UDID, fixture PID and template; `time-sample` export contains 5 rows |
| System Trace | exit 0 | TOC confirms target/template, but `context-switch` export has 0 rows; scheduling coverage unproven |
| Animation Hitches | exit 2 | explicit “Hitches is not supported on this platform”; saved failed artifact is not success |
| Hangs | no standalone template | Time Profiler recording options and TOC include Hangs; hang detection itself unverified |

Successful recordings warned that one table lacked a known input source.
Preserve such warnings; readable output does not establish every instrument works.
`--notify-tracing-started` is documented by the installed CLI; notification-based
readiness and graceful interruption remain unverified implementation checks.

Artifacts are local temporary investigation data under `/private/tmp/`:
`mcp-ios-time-profiler-name-01a1a646.trace`,
`mcp-ios-system-trace-01a1a646.trace`, `mcp-ios-animation-01a1a646.trace`.
Exports: `mcp-ios-time-samples-01a1a646.xml`,
`mcp-ios-system-toc-01a1a646.xml`, `mcp-ios-context-switch-01a1a646.xml`.
These were temporary investigation artifacts, subsequently removed during task cleanup; they are not tracked repository artifacts.
Fixture uninstall and simulator shutdown both passed; no recording remained active.

Owning code inspected: `src/observe/system-trace.ts`,
`src/server/handlers/diagnostic.ts`, `src/server/handlers/journey.ts`,
`src/server/schemas/system-trace-schema.ts`, and `src/utils/resolve-device.ts`.
Current session metadata and journey validation hardcode Android; existing APIs
must be extended consistently rather than routing iOS into the Perfetto adapter.

## Updated-server verification and input tooling

The default Homebrew `idb_companion` 1.1.8 (built 2022-08-12) can read this
simulator hierarchy but its HID input fails because it loads SimulatorKit from
`Contents/Developer/Library/PrivateFrameworks/SimulatorKit.framework`. Xcode 27.2
ships it under `Contents/SharedFrameworks/SimulatorKit.framework` instead.
A direct tap on the offline fixture reproduced that failure without tracing.
The early full smoke runs therefore failed; their assertions were not weakened.

For the successful input verification, a **test-owned** companion used a private
layout alias under `/private/tmp/mcp-idb-xcode-o6ks8j9h/Contents/Developer`:
other Xcode contents were symlinks to the installed Xcode, with an additional
`Developer/Library/PrivateFrameworks/SimulatorKit.framework` link to the actual
SharedFrameworks location. `DEVELOPER_DIR` was set only for that companion.
The installed Xcode and existing companion were not modified or replaced.

The isolated companion command was:

```sh
DEVELOPER_DIR=<private-alias>/Contents/Developer idb_companion \
  --udid F9243BAF-62A8-4990-8A99-17F527F56FDA \
  --grpc-domain-sock /private/tmp/mcp-ios-trace-idb.sock --log-level info
```

The smoke passes `IDB_COMPANION=/private/tmp/mcp-ios-trace-idb.sock` explicitly
into the built server, using the installed idb client's supported companion
option. Instruments uses the real selected Xcode. This is verification-specific
tooling setup, not a new shipped input backend or proof that default idb HID works
with Xcode 27.2. Environments need a compatible idb companion for input journeys.
Capture-only use does not require idb input. See [plan](plan.md) and the final
[simulator evidence](simulator-evidence.json) for exactly what passed and cleanup.

A later long smoke run passed tap → Done (66 exported sample rows), cancellation,
expiry and failed-journey handling, then returned `TRACE_UNSUPPORTED` starting an
independent shutdown probe. Its exact prerequisite cause was not established;
a subsequent standalone capability read found all capture prerequisites available.
The original smoke then incorrectly reported expired completed metadata as failed
cleanup after ten minutes. [That failed report](late-run-failure-evidence.json)
is retained. The harness now tracks only sessions that still require cleanup and
queries explicit capabilities before the separate shutdown probe. The prerequisite
failure is not attributed to CPU load or a particular permission without evidence.

Final cleanup verified the simulator returned to Shutdown and no Readiness.app
fixture remained. The test-owned companion, layout alias, socket and private log
were removed. The final standalone combined smoke passed; its exact build and
outcomes are recorded in plan.md and simulator-evidence.json.
