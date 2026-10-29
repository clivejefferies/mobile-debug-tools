# Spec Review Template

Use this structure for every spec review:

## Verdict
- Ready / Needs clarification / Needs implementation contract / Needs execution contract / Not ready

## Summary
- One short paragraph on the spec's current quality.

## What is good
- List the strongest parts of the spec.

## Issues
For each issue, include:
- **Type:** spec / implementation / implementation contract / execution / doc
- **Severity:** low / medium / high
- **Why it matters:** one sentence
- **Fix:** exact change needed

## Missing contract or execution surfaces
- List any API shapes, response fields, state transitions, invariants, or runtime execution rules that are still undefined.

## Codebase alignment
- Note whether the spec matches current `src/`, docs, and tests.

## Next step
- State the smallest next action needed to move the spec forward toward implementation readiness.
