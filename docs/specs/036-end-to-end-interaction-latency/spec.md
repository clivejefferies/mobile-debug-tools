# End-to-end interaction latency — specification

Status: accepted on 2026-11-06 by the user's “ok” in response to the complete
specification in this chat. The [intent](intent.md) was
accepted by the user's “ok” on 2026-11-06. Source: [issue #100](https://github.com/clivejefferies/mobile-debug-tools/issues/100).

## Outcome and boundaries

Publish reproducible current-build round-trip measurements and identify where
time is spent. Reuse Spec 018's Android fixture and stdio MCP harness, Spec 019's
tree metrics, and existing timing helpers. This stage authorizes benchmark and
opt-in instrumentation changes, not runtime optimizations. A measured candidate
requires a specification amendment identifying its path, correctness risks,
and comparison criteria before implementation. A negative finding is valid.

No new MCP tools, arguments, response fields, errors, defaults, verification
semantics, or caching are introduced. Instrumentation is disabled by default
and emits only benchmark diagnostics to stderr, preserving stdio protocol output.

## Measurement protocol

Measure a locally built server over a real SDK stdio client. Record commit,
working-tree state and source/build hashes, package and Node versions, host,
platform/OS, device model, emulator configuration, fixture hash, and applicable
adb/Xcode/idb versions. Dirty source is explicitly identified; generated reports
are distinguished from changes to measured source. Capture exact commands,
timeouts, instrumentation settings, starting state, and run order.

Reuse the six-transition Android fixture journey with explicit destination
assertions. Retain the standalone handle-based comparison. Compare journey
full/debug, full/compact, light/debug and light/compact to separate response-mode
cost from verification cost. All comparisons retain destination assertions.
Do not use verification `none` as evidence of equivalent verification.

Each case receives three warm-ups and ten measured attempts. Alternate mode
order across rounds to reduce ordering bias. Preserve warm-up failures separately
from measured failures. Report raw per-attempt durations, success/failure and
stage, sample counts, nearest-rank p50/p95, minimum and maximum. Percentiles
describe successful attempts only; failures remain visible and prevent a claim
that the entire run passed. Missing samples produce unavailable statistics,
never zero latency. Ten samples provide a preliminary p95, not a robust tail
estimate; state that limitation.

Measure `capture_screenshot`, `get_ui_tree`, and screenshot/log-free
`capture_debug_snapshot` separately on the same known fixture screen. Record
response byte counts without retaining response contents. Fixture build,
installation/reset, server startup, and any Gradle or validation-suite execution
are separate phases excluded from steady-state MCP round trips. Device-side
application work within a round trip remains included unless independently
measured; do not mislabel it as pure MCP overhead.

## Attribution

Use monotonic clocks for client request-to-response and server intervals.
Attribute device resolution/readiness, subprocess/tool acquisition, screenshot
capture/encoding, physical tree acquisition/retries/parsing, waits, dispatch,
verification/assertions, and response construction/JSON serialization where
observable. Reuse existing timing and observation events before adding probes.
Correlate events using generated request/acquisition IDs and serialize requests
within a run. Document inclusive/nested intervals; do not sum overlapping spans.

Report unattributed residual time explicitly. Client round-trip minus server
timing includes transport, scheduling and uninstrumented work; it is not an
exact transport or serialization measurement. SDK wire serialization and device
application execution may remain unattributed. Instrumentation failures or
missing events are diagnostic gaps, never invented component timings. Compare
instrumented and uninstrumented observation runs to disclose probe overhead.

## Platform ownership and safety

Pin every request to an explicit device; never fall back to a physical phone.
Run one fixture workload at a time. Reset/install only the dedicated Android
fixture, restore changed settings, and remove run-owned temporary files and
processes. Do not change display configuration silently. No real user app data
is reset. Reports omit device serials, screenshots, UI trees, logs, credentials,
raw command arguments and unrestricted subprocess output; use fixture aliases
and sanitized failure classifications.

[Issue #89](https://github.com/clivejefferies/mobile-debug-tools/issues/89) owns
the iOS static/network fixture and paired tree protocol. Reuse it when available;
do not create a competing fixture here. Standalone iOS observation measurements
may use an explicitly identified stable simulator screen, separately labelled
from fixture journeys. If no simulator or shared fixture is available, report
those cases blocked with prerequisites and runnable next steps. Physical iOS
coverage is excluded from this simulator investigation.

## Failures and verification

Preserve existing action, wait and verification deadlines. Bound harness calls
and setup operations; on timeout, cancellation or interrupt, record the failed
attempt and close the owned client/server. Verify owned subprocess exit and
cleanup; do not kill unrelated processes or leave a timed-out request running
while measuring another. If safe recovery cannot be established, stop that case
and report remaining attempts unrun. Never retry invisibly.

Use unit checks for percentile/failure accounting, redaction, correlation and
instrumentation enabled/disabled behavior where changed. Run `npm run verify`
and applicable `npm run test:device`, plus the repeated benchmark. Runtime
changes later require focused deadline, cancellation, cleanup, freshness,
device-isolation and stabilization regression checks and paired results on the
same fixture, settings and instrumented baseline. Existing Spec 018/019 gates
remain applicable to their original comparisons; new mode measurements must
not be forced through unrelated speedup gates.

## Acceptance and reporting

1. Reports reproduce each measured case with environment/build identifiers,
   commands, run order, p50/p95, raw attempts and visible failures.
2. Phase and component attribution separate setup/build/test-suite time, expose
   overlap and gaps, and quantify instrumentation overhead.
3. Mode comparisons retain assertions; platform coverage and #89 dependencies
   are explicit. Report observed bottlenecks or a justified negative finding.
4. No public contract or normal diagnostic-output change occurs. Cleanup,
   timeout and interrupt checks pass for changed harness paths.
5. Any later optimization has separately accepted scope and improves its paired
   baseline without correctness or verification regressions.

Expected modules: existing latency benchmark/report helpers, shared benchmark
support where useful, opt-in timing hooks near server/observation/subprocess
boundaries, focused unit tests, and benchmark documentation. Main risks are
probe overhead, nested-span double counting, emulator variance, and unavailable
iOS prerequisites; reports must expose each rather than hide it.

Investigation on 2026-11-06 found an attached Android emulator and no booted iOS
simulator. The existing latency and tree harnesses are Android-only. These are
prerequisite observations, not current-build performance or correctness results.
