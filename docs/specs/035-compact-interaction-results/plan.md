# Implementation plan

[Intent](intent.md) and [specification](spec.md) approved by the user's two “ok”
responses on 2026-11-05. Implement on existing feature/compact-interact-results;
preserve unrelated edits. Compact shape changes are intentional; debug is compatible.

## Ordered work

- [x] Preserve full internal action/journey diagnostics until final response boundary.
- [x] Add bounded session result store, strict diagnostics schema/tool and dispatch.
- [x] Project final action/child/journey payloads with explicit freshness and byte bounds.
- [x] Update consumers, contract fixture, tool docs, README, changelog and plugin guidance.
- [x] Verify regressions, store limits, errors, final serialized budgets and debug parity.
- [x] Run native checks and record evidence, review diff and report limitations.

## Verification map

| Criteria | Checks |
| --- | --- |
| Baselines and byte reductions | Existing baseline plus deterministic fixture matrix; UTF-8 bytes and labelled bytes/4 estimate |
| Bounds and semantics | Final handleToolCall responses; conditional/delta-heavy/multibyte cases, 50 steps, paused/throwing errors, stale/unknown/overlapping evidence |
| Diagnostics | Fidelity, no replay, injectable clock expiry, count/byte eviction, oversized rejection, invalid UUID/session and concurrent IDs |
| Compatibility | npm run verify; schema/definition fixture; debug shape, existing journey and correlation tests; docs/plugin consistency |
| Native | npm run test:device; updated dist server through MCP stdio on emulator-5554 and booted iOS simulator |

Node >=22 required (local v23.11.0); existing TypeScript/tsx dependencies. Use
`node --import tsx` for focused tests if tsx IPC is restricted. Native checks need
ADB/emulator and Xcode/simctl/idb. Before native runs inspect connected devices and
fixture availability. Start from Settings or isolated fixture app; exercise harmless
dispatch-only input, post-observation, blocked selector, journey and lookup. Capture
server commit+working diff, device/OS, response bytes, evidence freshness, unknown
states, failures and cleanup. Restore starting screen and shut down simulators booted
for this task. Use deterministic fixtures for unsafe native failure/cancellation paths.

CI uses Node 22 on Ubuntu, lint/build/unit, Java worker compilation and package-file
checks. Android integration is workflow_dispatch only; iOS checks are not in CI.
Local verify additionally runs agent-plugin consistency. No publish/push authorised.

## Results

`npm run verify` and final `npm run test:device` passed. See
[verification record](verification.md) for exact coverage, byte measurements,
the intermittent trace-shutdown investigation and unrun optional fixtures.
