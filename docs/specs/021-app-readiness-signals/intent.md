# Intent: app readiness signals

Originator: repository maintainer (current conversation).
Date: 2026-10-29. Status: approved.
Source: [GitHub issue #65: App readiness signals](https://github.com/clivejefferies/mobile-debug-tools/issues/65), roadmap priority 2 of 9.

## Problem

Clients can mistake an observation captured during loading or a transition for
settled app content. They also need to distinguish an unresponsive app from an
app paused by a debugger, where evidence permits.

## Desired outcome

Android/iOS observations and bounded waits expose evidence-backed readiness:
loading, transitioning, settled, unresponsive, and debugger-paused. Results carry
the supporting observations and uncertainty so clients can decide whether to act,
wait, or investigate. A screenshot alone does not establish readiness.

## Scope and success criteria

- Build on existing observation, loading-state, snapshot, and wait contracts.
- Distinguish readiness states only when available evidence supports them;
  otherwise report uncertainty rather than guess.
- Bound waits and distinguish timeout/observation failure from proven app
  unresponsiveness.
- Coordinate with debugger sessions when available; do not invent a current
  debugger integration.
- Preserve existing tool behaviour unless the approved spec explicitly changes it.

## Exclusions and questions

No runtime debugger implementation, automatic recovery/restart, or performance
profiling. The spec must define state evidence, sampling/stability rules,
unsupported signals, API placement, and how long observations remain current.

## Approval

Approved on 2026-10-29 by the originator’s “yes” in direct response to the
complete intent summary and linked artifact in this conversation.
