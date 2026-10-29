# Intent: conditional actions

Originator: repository maintainer (user in the current conversation).
Date: 2026-10-29.
Status: approved.

## Original problem

“Conditional actions: Check expected state immediately before acting; stop and
return fresh evidence if it changed.”

Source: user request in the current conversation, following adoption of the
repository development process.

## Desired outcome

An MCP client can make an action conditional on an expected UI state. The server
checks that expectation against a fresh observation of the same target device
immediately before dispatching the action. If the expectation no longer holds,
the server does not dispatch the action and returns fresh evidence so the client
can reassess its next step.

Affected users and systems: MCP clients/agents, interaction tool dispatch,
state observation, and Android/iOS adapters for supported actions.

## Observable success criteria

- A matching expectation allows the requested action to proceed normally.
- A mismatching expectation prevents dispatch and clearly reports that the
  action was not performed, together with the newly observed state.
- If the expected state cannot be checked reliably, the action is not dispatched;
  the response explains the observation failure without inventing evidence.
- The check and action target the same device.
- A mismatch does not automatically retry the action or adopt the new state.
- Existing calls without a condition preserve their behaviour.

## Constraints and exclusions

- Reuse existing action, observation, and response conventions where suitable.
- Define precise supported conditions, actions, evidence, and platform coverage
  in the spec after approval of this intent.
- A pre-dispatch check cannot guarantee the UI remains unchanged between the
  observation and native input delivery; do not claim atomic device execution.
- Automatic replanning, rollback, and post-action success verification are
  outside this feature's scope.
- Preserve unrelated checkout changes.

## Assumptions and open questions for specification

- Proposed compatibility approach: conditions are optional on supported actions.
- Determine the initial action set, including whether journey steps are covered.
- Determine whether expectations use screen identity, element properties,
  snapshot revisions, or a supported combination.
- Define fresh mismatch evidence and how it is preserved in compact responses.
- Existing screen fingerprints deliberately omit some changing values; assess
  their suitability rather than assuming they detect every relevant state change.

## Approval

Approved by the originator in the current conversation on 2026-10-29: “yes”,
in direct response to the complete intent summary and linked artifact. Approval
covers the captured intent; specification approval remains a separate gate.
