# Code structure and quality checks

[Documentation](README.md) · [Contributing](../CONTRIBUTING.md)

Run `npm run lint` before submitting a change. It runs the existing ESLint rules
and `npm run check:quality` plus `npm run check:architecture`. These checks also run in `npm run verify` and the
unit CI job; quality failures exit nonzero even with ESLint's `--quiet` option.

## Limits

Production TypeScript is checked against these defaults:

| Metric | Limit |
| --- | ---: |
| File length | 500 lines |
| Class length | 300 lines |
| Function or method length | 80 lines |
| Cyclomatic complexity | 20 |
| Control-flow nesting | 4 |
| New explicit `any` | 0 |

Line counts exclude blank and comment-only lines. Java source has the file-length
limit; TypeScript class/function/type metrics do not apply to Java. Existing
ESLint rules still apply to tests, but the production size gates do not apply to
fixture tables or self-running test scripts.

Prefer cohesive responsibilities and typed boundaries. Avoid compressing code,
adding trivial wrappers, or disabling rules to meet a number. The checks help
identify risk; passing them does not replace a design or correctness review.

## Architecture checks

`npm run check:architecture` uses pinned ArchUnitTS (`archunit`) to enforce four
rules over the production dependency graph:

- Shared contracts cannot import application implementations outside `contracts/`.
- Capability and shared modules cannot import the MCP server layer.
- The listed pure interaction calculations cannot import native I/O or service
  facades. Their exact scope is defined in
  [the rules](../scripts/check-architecture.mjs).
- Production runtime dependencies must be cycle-free. Type-only dependencies
  count for boundary rules, but type-only cycles do not count as runtime cycles.

ArchUnitTS 2.5.4 extracts static imports. A small
[TypeScript resolution adapter](../scripts/architecture-graph.mjs) adds re-exports,
import types, literal dynamic imports, `require` calls and Node builtins. It uses
the repository's `tsconfig.json`, including NodeNext `.js` imports. Nonliteral
loads and unresolved dependencies fail the check instead of silently disappearing.
Boundary rules check direct dependencies; cycle detection checks the internal
runtime graph. This does not analyse Java worker dependencies or reflective loads.

[Negative-control tests](../test/unit/quality/architecture.test.ts) prove that
broken boundaries, cycles, aliases, and dynamic/re-export dependencies are caught,
and empty or incomplete graphs fail. The current graph needs no cycle exceptions.
Keep new rules aligned with the module ownership below; changing architecture
requires reviewing the rule alongside the implementation.

## Baseline policy

The [reviewed baseline](../scripts/code-quality-baseline.json) is empty: all
production source currently meets the default limits, including zero explicit
`any` occurrences. If an exception is explicitly approved, its entry records the
file, rule and symbol. Each entry is a ceiling, not a target.
An existing exception cannot grow, and an improvement must lower or remove its
entry. New files and renamed symbols do not inherit exceptions. Unrelated
improvements cannot compensate for a regression elsewhere.

Lint and CI never regenerate the baseline. When reducing debt, edit the affected
entries explicitly and include that diff in review. New debt or raised ceilings
require a design decision and review; there is no blanket suppression mechanism.
Inline suppression of these gates is rejected. Anonymous callbacks have identities
based on their enclosing scope and body, so changing an exceptional callback
requires reviewing its exception rather than silently transferring it.

## Module ownership

- `src/server/` is the MCP boundary: `definitions/` publishes tools,
  `schemas/` validates MCP requests, and `handlers/` dispatches them.
  `tool-definitions.ts` assembles the public definitions; `common.ts` provides
  argument readers and response serialization. Capability handlers live in
  `manage.ts`, `observe.ts`, `interact.ts`, `input.ts`, `journey.ts`, and
  `diagnostic.ts`. `action-execution.ts` owns dispatch, condition handling,
  verification and response phases; the central handler retains registration,
  timing and debugger guards.
- `src/contracts/` holds shared input shapes and validation used across
  capabilities. These contracts do not depend on MCP dispatch.
- `src/runtime/` currently holds action-result and trace construction shared by
  dispatch and interactions, plus a small injectable wall-clock/delay interface
  for polling services. Production clocks retain existing timer and readiness
  budget semantics. It is separate from MCP response serialization;
  interaction and runtime modules cannot import server-layer code.
- `src/interact/` owns actions and their supporting services. `index.ts` is the
  composition facade; `android.ts` and `ios.ts` implement native input.
  `adjustment/` contains adjustable-control strategies and calculations;
  `targeting/` contains candidate ranking, element handles and target resolution;
  `waits/` contains synchronization and legacy waits; `assertions/` contains
  screen, visibility and state checks. Shared observation and input interfaces
  remain at the interaction root. `ToolsInteract` must meet the 300-line class
  budget without exceptions.
- `src/observe/` owns evidence acquisition and snapshots. Android and iOS facades
  delegate to platform folders for trees, logs, screenshots, fingerprints and log
  streams. Snapshot collection, log normalization and semantic summaries are
  separate modules; screenshot encoding retains platform-specific alpha policies.
- `src/manage/ios/` owns Xcode project and scheme discovery, build preparation,
  execution, watchdogs and diagnostics behind the existing iOS facade.
- `src/system/` separates probes, platform capability policies and status summaries.
  `src/utils/android/` separates commands, Gradle preparation, logs and UI parsing;
  `utils.ts` retains compatibility exports and device discovery.
- `src/observe/network/` infers HTTP activity from Android logcat and iOS
  simulator logs. It supports `get_network_activity` and action classification;
  it is not packet capture or a proxy. Results depend on the app logging requests,
  and the current implementation does not measure request duration.
- `src/debugger/protocol.ts` validates worker messages. The session manager owns
  serialized transitions and cleanup; the Java worker owns JDI operations.

The [refactoring plan](specs/026-code-structure-and-quality-gates/plan.md) records
progress and verification. The [follow-on health cleanup](specs/026-code-structure-and-quality-gates/health-plan.md)
records removal of the legacy baseline and the Node 22 dependency updates.
