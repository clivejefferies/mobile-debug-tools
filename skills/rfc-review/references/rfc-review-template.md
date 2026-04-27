# RFC Review Template

Use this structure for every RFC review:

## Verdict
- Ready / Needs clarification / Needs implementation contract / Not ready

## Summary
- One short paragraph on the RFC's current quality.

## What is good
- List the strongest parts of the RFC.

## Issues
For each issue, include:
- **Type:** spec / implementation / implementation contract / doc
- **Severity:** low / medium / high
- **Why it matters:** one sentence
- **Fix:** exact change needed

## Missing contract surfaces
- List any API shapes, response fields, state transitions, or invariants that are still undefined.

## Codebase alignment
- Note whether the RFC matches current `src/`, docs, and tests.

## Next step
- State the smallest next action needed to move the RFC forward.
