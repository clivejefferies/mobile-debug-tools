# Code structure and quality checks

[Documentation](README.md) · [Contributing](../CONTRIBUTING.md)

Run `npm run lint` before submitting a change. It runs the existing ESLint rules
and `npm run check:quality`. Both checks also run in `npm run verify` and the
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

## Existing debt

The [reviewed baseline](../scripts/code-quality-baseline.json) records remaining
legacy exceptions by file, rule and symbol. Each entry is a ceiling, not a target.
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

- `src/server/definitions/` holds public tool definitions by capability;
  `src/server/tool-definitions.ts` assembles them in their existing order and adds
  shared controls.
- `src/contracts/` holds reusable input shapes and validation independent of MCP
  dispatch. Server compatibility exports keep existing import paths working.
- `src/runtime/` constructs action results and traces independently of MCP
  serialization. Interaction and runtime modules cannot import server-layer code.
- `src/interact/` owns targeting, control calculations, actions, waits and
  assertions. Pure helpers accept explicit typed inputs and can be tested without
  replacing static methods. `ToolsInteract` is the composition facade and retains
  existing entrypoints; it must meet the 300-line class budget without exceptions.
  Adjustment services use the `adjustment*` modules; candidate resolution uses
  `candidate*` and `find-element`; synchronization uses `ui-wait*`, `ui-change*`
  and `screen-wait`; assertions use `state-assertion*`, `visibility-assertion` and
  `screen-assertion`. The `legacy-wait*` modules preserve the older wait modes.
- `src/debugger/protocol.ts` validates worker messages. The session manager owns
  serialized transitions and cleanup; the Java worker owns JDI operations.

The [refactoring plan](specs/026-code-structure-and-quality-gates/plan.md) records
progress and verification. Remaining baseline entries are known debt, not evidence
that the entire source tree meets the defaults.
