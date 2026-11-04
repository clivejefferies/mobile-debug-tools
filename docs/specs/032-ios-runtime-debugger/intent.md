# iOS runtime debugger — intent

- Source: [issue #70](https://github.com/clivejefferies/mobile-debug-tools/issues/70), and the user's 2026-11-04 request to take the next Ready ticket with Android-equivalent functionality, including async debugging.
- Originator: user in this chat.
- Captured: 2026-11-04.
- Status: intent approved by the user's “ok” on 2026-11-04 in response to the scope and approval request in this chat. Specification also approved in this chat on 2026-11-04; see spec.md. Issue #70 matches the roadmap and current branch; Ready-column membership could not be checked because GitHub authentication lacks `read:project`.

## Problem and outcome

MCP clients can debug Android development apps but lack equivalent iOS runtime
inspection. Add an LLDB-backed debugger for iOS simulator development apps,
reusing the existing debugger tools and session/evidence conventions where
appropriate. Support attach, source breakpoints and events, bounded stacks and
shallow locals, stepping, resume and detach, with explicit capabilities and
actionable setup failures.

## Async parity and success

Verify a deterministic Swift concurrency fixture with source stops and useful
locals before and after `await`, resumed execution, nested task work, task
cancellation and application recovery. Assess stepping across suspension and
report its observed limits. Android's existing coroutine assessment establishes
execution inspection, not reconstruction of suspended tasks or logical async
stacks; distinguish those capabilities explicitly on iOS too.

Preserve stale-reference rejection, pause-aware interaction guards, bounded
waits/cancellation, session isolation, expiry and owned cleanup. Prove the journey
through actual MCP calls and independent fixture outcomes, and retain Android
regression coverage. Report unavailable environments honestly.

## Constraints and questions

Physical-device support follows separately. Evaluation, mutation, arbitrary LLDB
commands and generic suspended-task reconstruction are excluded from this initial
scope. Inspect LLDB/Xcode support for async frames and stepping before proposing
the exact capability contract. Debug values remain bounded and sensitive; avoid
persisting app data in public evidence. Specification approval follows intent
acceptance under the repository process.
