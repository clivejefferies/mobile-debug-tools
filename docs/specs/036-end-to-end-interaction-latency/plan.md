# Implementation and verification plan

[Intent](intent.md) and [specification](spec.md) accepted by the user in this
chat, each with “ok” on 2026-11-06. No runtime optimization is authorized.

## Work

- Add opt-in request timing events using existing AsyncLocalStorage timing and
  tree metrics. Include subprocess intervals, preserve normal responses/output.
- Add a dedicated end-to-end benchmark alongside the historical Spec 018
  benchmark. Reuse its fixture and journey, alternate modes, retain failed
  attempts, record build identity and separate setup phases, write new reports.
- Add deterministic tests for accounting, privacy, disabled instrumentation,
  nested/concurrent timing and owned process cleanup. Bound fixture builds.
- Run validation, then device measurement. Review reports and document
  bottlenecks, negative findings and coverage limitations. No speculative fixes.

## Verification mapping

| Acceptance | Check |
| --- | --- |
| Reproducible attempts and percentiles | Unit report checks; repeated Android run (3 warm-ups + 10 attempts/case) with environment/build hashes |
| Separate phases/components/overhead | Setup ledger; request/tree spans; instrumented/uninstrumented observation comparison |
| Assertions and platform coverage | Six-transition fixture journey in all modes; report explicit iOS blocker and #89 ownership |
| Contracts and cleanup | Opt-in instrumentation unit tests; timeout/interrupt owned-process checks; `npm run verify`; `npm run test:device` |
| Optimization discipline | Report measured findings; no optimization in this stage |

Commands: `npm run verify`, `npm run test:device`, and
`LATENCY_DEVICE_ID=emulator-5554 MCP_ADB_TIMEOUT=30000 npx tsx test/device/automated/latency/end-to-end.ts`.
Requires Node >=22, installed npm dependencies, Java capable of `--release 8`,
Android platform/build-tools 36/36.0.0, adb and a running emulator. Fixture build
uses existing offline SDK tools; no Gradle or network dependency.

Device starting state: explicitly named Android emulator, dedicated fixture
installed/reset by harness; no display/settings changes. Each attempt starts
with reset fixture and stopped process. Journey asserts every destination;
observations use its known final screen. Evidence: timing-only JSON/Markdown,
fixture/build hashes, attempt outcomes, cleanup status. Remove run-owned remote
temporary files, force-stop fixture and close server on completion/interruption;
preserve pre-existing apps/settings.

iOS: no simulator was booted during specification. No shared #89 static/network
fixture exists in this checkout; fixture journey remains blocked pending that
work. Record simulator availability again during execution. Physical iOS is
excluded. Existing suite may skip optional fixture checks; report actual scope.

Risks: instrumentation perturbation, nested intervals, emulator contention,
long full-verification runs. Keep transport residual unlabelled, document gaps,
stop measurement after unsafe timeout/cleanup failure, preserve partial reports.
No commit/push/release is included.

## Results

Benchmark code, request instrumentation and timing reports are implemented.
Android produced nine successful measured samples per case, two additional
measured failures, three warm-up failures and nine unrun attempts before an
emulator crash. The iOS smoke reached its readiness check and produced zero
timing samples. See [findings](../../benchmarks/end-to-end-latency/investigation.md)
and [verification](verification.md) for evidence, cleanup and remaining gates.
