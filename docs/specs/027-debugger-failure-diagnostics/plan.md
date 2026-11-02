# Plan: debugger failure diagnostics

[Intent](intent.md) · [Accepted specification](spec.md)

Intent approved with “looks good”; specification accepted with “ok” in this chat
on 2026-11-02. No publication, commit or push requested.

## Implementation

- [x] Add a bounded static diagnostic catalog and typed error propagation.
- [x] Classify preparation, subprocess, IPC and Java attach/transport failures.
- [x] Preserve diagnostics through sessions, cleanup, capabilities and MCP wrapping.
- [x] Add isolated worker/protocol/privacy and lifecycle regression coverage.
- [x] Align tool docs, changelog and packaged usage skill.

## Verification

Node >=22, JDK >=17; Android fixture additionally needs SDK/build-tools 36.

| Criteria | Check |
| --- | --- |
| 1, 2, 4 | Focused self-running diagnostic, protocol and MCP tests with hostile input and fake workers |
| 3 | Session tests: timeout/cancellation, event race, cleanup retry, isolation, shutdown |
| 1–4 | `npm run verify` (lint/quality/architecture, build, all units, plugin consistency) |
| 5 | `npm run test:device`; then `MCP_DEBUGGER_DEVICE=<serial> npx tsx test/device/automated/debugger/runtime.android.test.ts` |
| 6 | Docs diff, local links and `npm run check:agent-plugin` |

Device journey: explicitly selected authorized Android target; install the isolated
fixture, attach, set/trigger breakpoint, inspect known stack/locals, step/resume,
assert Result 43 in a fresh UI tree, detach and compare forwards. Existing runner
records server fingerprint/device/API and removes its package/temp data in finally.
Do not use a user app as a failure fixture. Physical Android and iOS evidence remain
separate. Fault injection uses isolated fake workers, never a production app.

Initial ADB discovery was blocked by sandbox binding restrictions. Retry discovery
with execution access; if no authorized target is available, record the concrete
blocker and leave live verification incomplete. Hosted CI is separate from local
checks. No dependency or release version changes are planned.

## Results

Implemented and locally verified on 2026-11-02. All checks below passed unless
explicitly marked unrun.

| Check | Outcome and evidence |
| --- | --- |
| `npm run verify` with Node 22.23.4 | **Pass**: ESLint, structural gates (no exceptions), architecture, TypeScript build, all 88 unit files, plugin consistency. Log: `/tmp/mobile-debug-81-verified.log`. |
| Three new debugger unit files | **Pass**: isolated real fake-worker spawn/exit/write errors, malformed/oversized IPC, attach refusal, timeout/cancellation, static catalog bounds, hostile error/diagnostic fields, fake-JDK prerequisite/compile failures, MCP wrapping, terminal retention, event/rejection race, device isolation, cleanup retry and shutdown. |
| `MCP_DEBUGGER_DEVICE=emulator-5554 npm run test:device` with Node 22.23.4 | **Pass**, 10 files. Includes Android debugger/interaction, Android+iOS screenshots/logs/UI trees/correlated evidence, and Android system traces. Log: `/tmp/mobile-debug-81-final-device.log`. |
| Final focused debugger fixture, Node 22.23.4 | **Pass**, MCP stdio, emulator-5554, Android 16/API 36. Exact final build SHA-256: `9528d796df4e01ca9d7668c32715a7ceff945a06a2f097fe4d57f16705f52eb3`. Log: `/tmp/mobile-debug-81-fixture-final.log`. |
| Actual Java JDI refusal check | **Pass**, Android Studio JBR OpenJDK 25.0.3; compiled worker contacted an explicitly closed temporary loopback port. Existing `DEBUGGER_WORKER_FAILED` retained, diagnostic `attach/connection_refused`; worker closed in finally. No app or device targeted. |
| Documentation | **Pass**: diff whitespace, relative links/paths, schema/recovery limits and packaged usage skill consistency. |

The final focused fixture started by installing/launching only the isolated debug
app. It verified a source breakpoint and stop, stack method, known local `42`,
bounded string/object summaries, pause guards, into/over/out stepping, stale
references, resume established by fresh UI-tree `Result 43`, missing variable
metadata, pending/removed breakpoints, event cancellation, repeated detach,
process loss and active paused-server shutdown. Exact owned forwards were removed;
unrelated forwards were preserved. Fresh UI evidence established execution after
shutdown, and the fixture package/temp data were removed in finally. The broader
suite leaves system Settings foreground and removes its own trace artifacts.

The broad device run preceded the last host-only pipe-failure consolidation and
terminal-command/cancellation diagnostic refinements; the full maintainer command
and focused Android fixture were rerun against the final code. Broader unaffected
observation/trace checks were not repeated. Preliminary Node 23 checks also passed;
final maintainer and focused debugger results above use Node 22.

## Focused review and limitations

Reviewed worker/Java protocol, error serialization, budget/cancellation paths,
capability probe compatibility, per-device ownership and cleanup races. Retained
legacy error codes (including generic prerequisite startup failures), fixed
phase attribution across attach deadlines, routed synchronous/asynchronous pipe
failures through one pending-request settlement path, and retained terminal
failure diagnostics on later rejected commands. No raw worker/compiler output
enters the new diagnostic fields. Public tool-definition parity passed.

Physical-device debugger coverage, real 60-second pause expiry in this run,
JDK 17 compilation/runtime and hosted CI are **unrun**. iOS observation smoke
coverage does not establish iOS debugger support. The earlier sandbox ADB/tsx
socket blockers were resolved with execution access. This implementation does
not establish the unknown cause of issue #80. Changes remain local, uncommitted,
unpushed and unpublished; the GitHub ticket has not been closed.

