# Specification: code structure and quality gates

[Documentation](../../README.md) · [Approved intent](intent.md) · [Development process](../process.md)

Date: 2026-10-30. Status: approved on 2026-10-30.
The maintainer approved the intent with “looks good” on 2026-10-30.

## Outcome and compatibility

Make the interaction implementation and debugger lifecycle easier to change and
review, and prevent new structural debt through failing local and CI checks.
This is an internal refactor: preserve tool names, schemas, accepted and rejected
inputs, defaults, error codes, response content blocks, targeting, retries,
deadlines, cancellation, observation freshness, pause guards, and resource cleanup.
Preserve exported handler entrypoints and existing test seams during migration.
No new capabilities, dependencies, transport changes, or framework migration.

## Module boundaries

Replace the large interaction implementation with a thin `ToolsInteract` facade
and cohesive modules under `src/interact/`:

- Shared types and pure UI helpers: normalized elements, selectors, bounds,
  identities, control values, and resolution results.
- Target resolution and a bounded resolved-element store: matching, actionable
  ancestors, ambiguity, handle freshness, and existing retention policy.
- Control adjustment: numeric planning/quantization, gesture strategy, and bounded
  adjustment orchestration as separate responsibilities.
- Synchronization: screen/UI change detection, polling and stability checks.
- Assertions: screen, visibility and readable-state verification.

Keep native input in existing Android/iOS adapters. Extracted services receive
narrow typed dependencies for observations, native delivery, clocks/delays, and
resolved-element access. Production composition supplies existing implementations;
unit tests can supply fakes without modifying unrelated static methods. Do not
create one universal service interface or move the monolith into another class.
The facade retains compatibility by forwarding calls through these services.

Move action-result and trace construction out of `server/common.ts` into a shared
runtime module. Domain services must not depend on MCP registration, handlers, or
serialization. Add an import-boundary check preventing such dependencies in the
extracted modules; compatibility re-exports may remain in the server layer.

Group server handlers and definitions by capability, with a central registration
index. For contracts touched by the extraction, define selector, targeting and
execution-control shapes once and reuse them in schema construction, runtime
validation and TypeScript types where compatible. Preserve existing validation
strictness and errors; do not replace permissive legacy parsing with strict
schemas incidentally. Keep documentation handwritten, backed by parity checks.

In `DebuggerSessions`, replace untyped stop/event/result boundaries with explicit
unions and validated worker-message shapes. Extract event buffering, expiry and
cleanup helpers where cohesive. Expand compressed transitions into readable
steps; preserve serialization, ownership, suspension and uncertain-outcome rules.
Java worker protocol and source behaviour remain unchanged.

## Enforced quality limits

Use the installed ESLint and TypeScript tooling, with no new package dependency.
Run structural checks as part of `npm run lint`, so both `npm run verify` and
existing CI enforce them. Failures must exit nonzero, regardless of `--quiet`.

| Metric | Default for production TypeScript |
| --- | --- |
| File length | 500 nonblank, noncomment lines |
| Class length | 300 nonblank, noncomment lines |
| Function/method length | 80 nonblank, noncomment lines |
| Cyclomatic complexity | 20, using ESLint's classic calculation |
| Nested control-flow depth | 4, using ESLint's calculation |
| Explicit `any` | No new occurrences |

Count classes, methods, declarations, expressions and arrow functions using syntax
trees, not regular expressions. Use consistent counting in checks and diagnostics.
Java source receives the 500-line file limit; class/function/complexity/type rules
apply to TypeScript only. Test fixtures are outside production structural limits;
existing lint still applies to tests. Do not apply mechanical production limits
to large fixture tables or self-running test scripts.

Record necessary legacy exceptions in a versioned, reviewed baseline with file,
rule, stable symbol identity and current metric ceiling. File metrics use a
file identity; explicit-any exceptions identify their enclosing symbol and count.
New files and symbols receive no inherited allowance. Existing exceptions cannot
exceed their recorded ceilings; unrelated improvements cannot offset regression
elsewhere. Renames or moved code do not automatically inherit exceptions.

The checker must reject missing or duplicate identities and obsolete entries;
reductions require lowering or deleting the corresponding baseline entry. No
automatic baseline rewrite in lint, verification or CI. Any explicit maintenance
command only proposes changes for review; it cannot silently accept debt.
Disallow inline suppression of these gates in production files. Exceptions belong
in the reviewed baseline, with a reason. Extracted interaction modules and the
refactored debugger session manager must meet defaults without new exceptions.
Do not add suppression comments, compress code, or invent trivial wrappers to
satisfy limits.

## Acceptance and verification

- `ToolsInteract` becomes a facade within the default file/class/function limits;
  control adjustment is divided by responsibility, not merely relocated.
- Extracted interfaces have no explicit `any`; schemas and handler types reuse
  shared definitions, and domain imports respect the new boundary.
- Deterministic tests establish that new/moved oversized classes and functions,
  complex/nested functions, explicit-any additions, forbidden imports and inline
  suppressions fail; valid code and unchanged legitimate baseline debt pass.
  Cover growth, identity collision, stale entries and reductions in the baseline.
- Capture public tool definitions before refactoring and compare after it. Exercise
  handler input/error and response parity, timeout/cancellation, ambiguity, stale
  handles, conditional rejection, pause guards, and ownership/cleanup. Normalize
  only nondeterministic identifiers and timestamps in comparisons.
- Existing unit coverage and new focused injection/contract tests pass, followed
  by `npm run verify`. Use Node 18 as the CI compatibility target; record actual
  local Node/JDK versions. Check Java compilation and npm package contents.
- Run `npm run test:device` and focused selector/adjustment/wait/debugger journeys
  on available fixtures. Record device/server identity, expected and observed
  outcomes, cleanup, and pass/fail/blocked/unrun status separately by platform.
  Missing devices or fixtures must be reported, not replaced with claims based
  on mocked adapters.

## Risks and rollout

The main risks are changed observation order, circular imports, lost receiver
binding, global state ownership, stricter accidental validation, and timeout or
cleanup drift. Implement in reviewable steps with focused checks after each;
retain public adapters until parity is established. Update the contribution guide
with limits, exception review and module ownership. Record remaining legacy debt
without describing the entire repository as fully refactored.

## Approval

The maintainer accepted this specification with “ok, lets do it” on 2026-10-30.
Implementation is authorised within this scope; see the [plan](plan.md).

## Subsequent maintainer decision — architectural checks

On 2026-10-30 the maintainer approved trying ArchUnitTS with “ok, lets try it”.
This explicitly extends the original dependency constraint to permit the pinned
`archunit` development dependency. Its checks complement the existing structural
limits and preserve the existing test runner and production dependencies.
