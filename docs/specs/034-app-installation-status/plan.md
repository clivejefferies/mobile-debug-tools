# Implementation plan

Intent and spec approved by user (“yes”, then “ok”) on 2026-11-05 in this chat.

- [x] Add shared installation observations and bounded platform probes.
- [x] Update inventory, system status, schema and selection diagnostics.
- [x] Cover status semantics, targeting, serialization and failures with fake tooling.
- [x] Align documentation and tool-definition fixture.
- [x] Run focused tests, npm run verify and npm run test:device.
- [x] Record Android installed/running, absent and no-context journeys; verify iOS separately.

Acceptance 1–3: native probes against checkout/build, recording exact device and scope.
Acceptance 2/4: deterministic unit tests with fake executable responses and selection fixtures.
Acceptance 5: verify (lint/build/unit/plugin), device suite and focused updated-server calls.
Node >=22 required; CI uses Node 22, additionally compiles/packages debugger workers;
Android CI is manual. Local default is Node 23.11.0; inspect available Node 22.
Android Pixel and emulator available; iOS simulator must be booted for conclusive checks.
No installation or app lifecycle changes required. Existing operation deadlines cap probes.

## Results (2026-11-05)

Implementation complete on `bugfix/app-installed`, uncommitted. Intent/spec approval
recorded in their documents. Shared bounded probes cover Android inventory and
system status plus iOS simulator inventory. Schema/handler, serialization,
selection diagnostics, compatibility fixture, guides and changelog are aligned.
Startup healthcheck logging now safely handles the existing error-result variant
with missing platform fields; making unknown installation fields optional exposed
that union during TypeScript compilation.

Native discovery showed Android `pm path` returns a silent nonzero exit for
missing packages. Added a successful targeted package-list fallback, within the
same deadline, to establish absence. Failed fallback remains unknown. This is an
implementation refinement of the accepted installed/absent/unknown semantics.

[Native evidence](native-evidence.json) records final MCP stdio calls, build hashes,
per-device results, baseline reproduction and cleanup. Automated assertions over
those saved calls passed. Physical Pixel 9 Pro (Android 17), emulator-5554
(Android 16) and iPhone 17 Pro simulator (iOS 26.4) passed installation observations:

- Android missing app context: unknown, no boolean; unchanged HEAD reproduced false.
- Modul8 dev package: installed on both Android targets; emulator process PID 4064
  was observed before device-suite execution (no claim of foreground readiness).
- Nonexistent package: absent on both Android targets using successful fallback.
- Safari installed and nonexistent bundle absent on the booted iOS simulator.
- Multiple-device system status: per-device installed results, no global boolean.
- Other unbooted simulators: unknown DEVICE_UNAVAILABLE, without attempted app queries.

Focused fake-tool tests pass: installed/absent, missing/invalid context, failed and
malformed queries, deadline timeout, per-device divergence, single/multiple system
aggregation and iOS plist parsing (macOS). Selection tests protect unknown status
and different-app isolation. Actual disconnected/unauthorized device failures
were not induced; these paths use deterministic failed-query/unavailable coverage.
The original agent request is unavailable; only the identified missing-context
failure path was reproduced. Physical iOS remains unsupported.

`npm run test:device`: PASS for executed checks (Android/iOS screenshots, logs,
UI trees and correlated evidence; Android trace lifecycle). The runner explicitly
reported coroutine/debugger, interaction/readiness fixtures and iOS tracing UNRUN
where environment selectors/dependencies were unset. These are not installation
coverage claims. Simulator restored to original Shutdown; suite leaves Android
Settings foreground, changes no app data or security settings. Native installed
checks and inventory do not launch or install apps.

`npm run verify`: PASS on both complete runs, including final regression coverage.
Final lint/architecture and build PASS; focused updated installation/selection
checks PASS. Runtime Node 23.11.0 (supported >=22), whereas CI uses Node 22.
CI additionally checks optional debugger compilation/package contents; those
unrelated checks were not rerun locally. Sandbox blocks tsx IPC/native services;
required suite/native commands succeeded with approved escalation.

Focused review found no remaining blocker: unknown booleans omitted, query
arguments device-scoped, malformed/native failures preserved, shared deadline
caps fallback/conversion, and no persistent app inventory/cache introduced.
