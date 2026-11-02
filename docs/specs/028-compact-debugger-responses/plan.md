# Plan: compact debugger responses

[Approved intent](intent.md) · [Accepted specification](spec.md)

Intent and specification each approved with “yes” in this chat on 2026-11-02.
No commit, push or publication requested.

## Implementation

- [x] Add per-call schema mode and immutable response projection at the handler.
- [x] Test defaults, exact retention, failures and worker argument isolation.
- [x] Extend isolated Android journey for compact MCP calls and paired byte counts.
- [x] Align tool docs, changelog, usage skill and public schema fixture.

## Verification

Node >=22, JDK >=17; device fixture requires Android SDK/build-tools 36.

| Acceptance | Check |
| --- | --- |
| 1–3 | Focused response/schema/handler unit tests and existing debugger units |
| 4–5 | `MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device`; focused runtime fixture in both modes |
| 1–3, 6 | `npm run verify`; public definitions and plugin consistency |

Device journey uses only the existing isolated fixture. Record build fingerprint,
Android target, known stop/local, fresh Result 43 UI assertion, stale references,
detach and forward cleanup. Pair both projections of each captured full response;
exercise actual compact responses separately. Preserve existing fixture finally
cleanup. Physical Android and hosted CI remain separate evidence.

Initial sandbox ADB discovery cannot bind its listener; retry with execution
access. No dependency, release or Java worker change is needed. Review omission
rules and error paths against the accepted specification before completion.

## Results

Implementation and focused review complete. Schema changes add only the optional
mode to all eleven debugger tools; the compatibility fixture changed by exactly
those eleven properties. Projection omits exactly three top-level fields, retains
unknown future fields and never mutates session/worker data. Presentation input
is removed before session dispatch. Reviewed success/catch/validation paths,
null and unknown session handling, diagnostic retention and detach uncertainty.

The focused unit check passed for all tool projections, schema defaults/invalid
modes, success/failure, paused references, unknown fields, incomplete cleanup,
immutability, handler errors and session argument isolation. Documentation links
and `git diff --check` passed. Remaining maintainer/device results follow below.

### Paired response measurement

Node 22.23.4, emulator-5554, Android 16/API 36, MCP stdio. Server fingerprint
(dist plus Java sources):
`fd2f526b5ee310ba485dcb2c3d060a06fe221b24afe511fa669347586f3a3a42`.
Default/full fixture journey **passed**. Starting state: isolated fixture freshly
installed/launched. It established source stops, known local 42, shallow summaries,
into/over/out stepping, stale references, fresh UI Result 43 after resume,
missing-metadata limitations, cancellation, detach, process loss and active paused
server shutdown. Owned forwards and fixture package/temp data were cleaned up.

Measured UTF-8 bytes of `JSON.stringify` on each MCP tool-result envelope, with
its existing pretty-printed JSON text. Each compact result projects the same
captured full payload: IDs, timestamps and operation data are identical. This
excludes transport JSON-RPC framing. The core table selects the first occurrence
of each named operation from the extended fixture journey; extra pending/removal,
stepping, failure and recovery calls are excluded from this table.

| Core operation | Debug bytes | Compact bytes |
| --- | ---: | ---: |
| Attach | 1,141 | 1,141 |
| Set breakpoint | 1,640 | 1,063 |
| Stop event | 2,597 | 2,020 |
| Stack | 7,805 | 7,228 |
| Locals | 2,780 | 2,203 |
| Step | 2,346 | 1,769 |
| Resume | 2,346 | 1,769 |
| Detach | 1,122 | 545 |
| Total | 21,777 | 17,738 |

Core reduction: **18.55%** (4,039 bytes). Across all 37 measured debugger calls:
81,974 → 65,818 bytes, **19.71%**. Each projected routine response saved 577 bytes
for this fixture target; discovery/state saved zero by design. These are measured
fixture results, not a general performance target. Parsed structure preservation
is checked independently in units. Raw per-call counts are in
`/tmp/mobile-debug-82-device.log`; no private user-app values were used.

### Final verification

- `PATH=/private/tmp/mobile-debug-node22/node_modules/node/bin:$PATH npm run verify`:
  **pass**, Node 22.23.4; lint/quality/architecture, TypeScript, all 89 unit files
  and plugin consistency. Log: `/tmp/mobile-debug-82-verify-node22.log`.
  Preliminary Node 23 verification also passed.
- `MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device` with Node 22.23.4:
  **pass**, all 10 device files. Includes Android debugger and interaction,
  Android/iOS screenshot/log/tree and correlated evidence, plus Android traces.
  Log: `/tmp/mobile-debug-82-device.log`. iOS observation coverage establishes
  no iOS debugger support. Trace artifacts removed; suite left Settings foreground.
- `MCP_DEBUGGER_DEVICE=emulator-5554 MCP_DEBUGGER_RESPONSE_MODE=compact npx tsx test/device/automated/debugger/runtime.android.test.ts`
  with Node 22.23.4: **pass**, same server fingerprint/API as above. Actual MCP
  calls verified omitted metadata on routine success/failure responses while
  retaining known locals, stop/cursor/state, stale errors, stepping, resume UI,
  process-loss and shutdown recovery. Fixture package/temp data and owned forwards
  removed in finally; unrelated forwards preserved. Log:
  `/tmp/mobile-debug-82-compact.log`. This run exercises compact output; its empty
  measurement list means byte counts are taken only from the paired full run,
  not that compact responses contain zero bytes.

Local maintainer verification additionally checks plugin consistency. Hosted CI
also compiles the Java worker with JDK 17 and checks package contents; those
hosted jobs were not run here. Android hosted integration is manual-dispatch
only. Physical Android debugger, real 60-second pause expiry, JDK 17 execution
and hosted CI remain **unrun**. No publication or installed-package claim is made.
Changes remain local, uncommitted and unpushed; issue status is unchanged.
