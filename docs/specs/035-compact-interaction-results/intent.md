# Intent: concise, trustworthy compact interaction results

Status: intent and specification approved; implementation and verification complete locally.
Originator: GitHub issue #99; author identity not independently checked.
Captured: 2026-11-05.
Source: https://github.com/clivejefferies/mobile-debug-tools/issues/99

## Problem

Recent agent feedback reports that routine taps return substantial metadata even
in compact mode. Clients need the action outcome, observed resulting UI state,
and actionable readiness blockers without repeatedly consuming detailed diagnostics.
Issue #82 addressed debugger responses; this work concerns ordinary interactions.

## Desired outcome and scope

Audit existing compact interaction and journey results on Android and iOS. Record
representative successful, failed, and blocked response sizes and retained fields.
Specify and validate an explicit compact output budget, with measured byte/token
reductions against that baseline. Retain action outcome, verification status,
observed state or explicit unknown, actionable blockers, and evidence correlation.
Keep detailed failure diagnostics accessible through an explicit supported path.

Check callers, serialization, documentation, and compact/debug compatibility
together. Device evidence must distinguish actual observations from dispatch-only
success; no screen may be described as current without an observation.

## Constraints and open questions

Exclude debugger redesign, latency optimization, and new interaction capabilities.
Investigation will establish the budget, retained fields, diagnostics access path,
and any compatibility impact for specification approval. Preserve verification and
readiness semantics; concise output must not imply stronger success evidence.

## Approval

The user approved this intent with “ok” in this chat on 2026-11-05.
This approves the problem and scope; the response contract was subsequently approved with “ok” in this chat.
