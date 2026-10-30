# Intent: correlated evidence

Originator: repository maintainer (current conversation).
Date: 2026-10-29. Status: approved.
Source: [issue #66](https://github.com/clivejefferies/mobile-debug-tools/issues/66), roadmap priority 3 of 9.

## Problem and outcome

MCP clients need to connect Android/iOS actions with screenshots and logs without
mistaking older observations for evidence of later actions. Existing action IDs,
snapshot metadata, and elapsed timings do not provide a consistent correlation
contract.

Clients should identify related evidence, distinguish observation capture, input
dispatch, and verification completion, and recognise stale observations.
Association must not imply causality or simultaneous capture.

## Scope and success criteria

- Extend existing conventions with shared identifiers and explicit phase timing.
- Identify stale evidence; preserve uncertainty when freshness is unknown.
- Preserve device targeting and report platform limitations.
- Allow future system traces to use the same correlation conventions.
- Preserve behaviour except for changes accepted in the specification.

## Exclusions and decisions

Exclude trace capture, runtime debugger, heap dumps, automatic recovery, and
background recording. Specification must resolve identifier lifetime, association,
clock semantics, freshness, log windows, compatibility, and resource/privacy
handling, building on existing helpers.

## Approval

The maintainer’s “yes” on 2026-10-29 approved the complete linked intent in this
conversation. This shorter version preserves that scope; specification approval
remains pending.
