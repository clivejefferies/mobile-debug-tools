

# RFC 004: Verification Routing for Local and Side-Effect Actions

## Status
Draft

## Summary

This RFC corrects a specification flaw in action verification routing where agents may treat lack of obvious UI change as a trigger to inspect network activity by default.

The current fallback can cause unnecessary network calls during purely local UI interactions (for example sliders, pickers, toggles, text entry), creating noise and reinforcing incorrect agent behavior.

This RFC separates:
- action verification
- failure diagnosis
- backend signal inspection

And introduces context-aware routing based on action type.

## Motivation

Observed agent sessions showed `get_network_activity` being invoked during local UI manipulation solely because an action produced no coarse-grained UI diff.

Current implicit reasoning resembles:

```text
if uiChanged == false:
  inspect network activity
```

This is overly broad.

For many interactions, absence of obvious snapshot change does not imply backend ambiguity. It often means verification used the wrong signals.

Examples:
- Slider value changed but tree structure did not.
- Picker selection updated in-place.
- Toggle changed checked state only.
- Text field value changed without large snapshot delta.
- Tab or accordion state changed through selection metadata.

In these cases network inspection is diagnostic noise, not evidence.

## Problem Statement

The current model conflates:

1. Verifying whether an action succeeded.
2. Diagnosing why an action may have failed.

These are distinct phases.

As a result:
- agents overuse network inspection
- verification costs increase
- local-state actions are treated as ambiguous too often
- network hints can be elevated beyond their intended role

## Goals

This RFC:
- Prevents default network fallbacks for local-state actions.
- Makes verification primarily state-driven.
- Restricts network activity inspection to side-effect actions where ambiguity remains.
- Refines `classify_action_outcome` decision routing.

## Non-Goals

This RFC does not:
- change raw snapshot precedence (raw remains authoritative)
- redefine expect_* ownership of verification
- make network activity mandatory evidence
- expand semantic hints into executable truth

## Action Categories

### Category A: Local-State Actions

Actions expected to modify client-side UI state.

Examples:
- tap toggle
- drag slider
- picker selection
- text entry
- scrolling
- tab switching
- expand/collapse
- local navigation controls

### Category B: Side-Effect Actions

Actions that may trigger backend or asynchronous side effects.

Examples:
- submit
- save
- sync
- search
- refresh
- login
- purchase flows

## Action Classification Source of Truth

## Action Type Emission (Runtime Contract)

`action_type` MUST be emitted by the runtime layer that produces or executes actions. It is not inferred by the agent.

There are three valid sources of truth, in order of precedence:

### 1. Tool Schema Annotation (preferred)

If the action originates from a tool invocation, `action_type` MUST be defined in the tool’s schema definition.

Example:

```json
{
  "name": "toggle_switch",
  "action_type": "local_state"
}
```

or

```json
{
  "name": "submit_form",
  "action_type": "side_effect"
}
```

This is the canonical source.

### 2. Handler Output (runtime execution layer)

If tool schema does not define `action_type`, the runtime handler that executes the action MUST attach it before returning the action result.

Example:

```json
{
  "action": "click",
  "target": "save_button",
  "action_type": "side_effect"
}
```

This is valid only when schema-level annotation is absent.

### 3. Fallback Mapping Table (last resort, deterministic only)

If neither schema nor handler provides `action_type`, the system MUST use a deterministic mapping table maintained by the runtime.

This table MUST be:
- static (no runtime inference)
- versioned
- explicitly defined in implementation

Example mapping:

| action | action_type |
|--------|------------|
| tap_toggle | local_state |
| enter_text | local_state |
| submit | side_effect |
| refresh | side_effect |

If an action is not in the table, it MUST default to:

```
side_effect
```

### Hard Constraint

Agents MUST NOT infer or override `action_type` based on UI state changes, snapshot diffs, or network activity.

### Normative Interpretation

`action_type` is part of the execution contract, not the reasoning layer.

Action type MUST be explicitly defined by the action schema or tool output.

Valid values:
- local_state
- side_effect

Agents MUST NOT infer action type from UI changes.

If action type is missing, agents MUST treat it as side_effect only if backend interaction is plausible; otherwise classify as local_state.

## Revised Verification Routing

### For Local-State Actions

Verification priority:

1. Expected state assertions
2. Refreshed snapshot comparison
3. Element property checks
4. Targeted expect_* verification

Signals may include:
- value changes
- selected state
- checked state
- focus changes
- labels/text
- enabled/disabled transitions
- position/state metadata

Network activity should not be used as default fallback.

## For Side-Effect Actions

Verification priority:

1. Expected UI/state verification first
2. Retry richer local verification if ambiguous
3. Only then optionally inspect network or log signals

Network signals are supporting hints, not primary proof of success.

## Decision Logic Update

Replace implied logic:

```text
if uiChanged == false:
  get_network_activity()
```

With:

```text
if expected_state_verified:
  success

elif action_type == local_state:
  retry using richer state verification

elif action_type == side_effect and ambiguity_remains:
  optionally inspect network activity

else:
  inconclusive
```

## Definition of Ambiguity

Ambiguity exists only when:

- expected state cannot be evaluated from UI snapshot, AND
- no single deterministic state predicate can be computed from UI fields

Ambiguity does NOT include:
- absence of visual diff
- absence of network activity
- lack of large UI tree changes

## Normative Rules

### Rule 1

Agents MUST NOT use network activity inspection as a default fallback for local-state actions solely because coarse UI diffs are absent.

### Rule 2

Agents MUST prefer explicit state verification over backend diagnostics whenever the action is expected to be locally observable.

### Rule 3

Network activity MAY be consulted only when:
- the action plausibly triggers backend work, and
- local verification remains ambiguous under the defined ambiguity criteria.

### Rule 4

Network activity evidence MUST be treated as auxiliary signal, not authoritative proof of action success.

## Unified Diagnostic Signals

Network activity and log inspection are equivalent diagnostic signals.

Both:
- are secondary to UI state verification
- MUST NOT be used as default fallback for local-state actions
- follow the same escalation rules defined in this RFC

## Impact on classify_action_outcome

`classify_action_outcome` should be interpreted as routing logic, not a mandatory network escalation path.

For `uiChanged=false`, action category determines next step.

No automatic implication:

```text
uiChanged=false => inspect network
```

## Expected Benefits

- Fewer unnecessary tool calls
- Cleaner verification traces
- Reduced cargo-cult network probing
- Better behavior for local UI interactions
- Stronger separation between verification and diagnosis
- More reliable agent reasoning

## Compatibility

This is a patch-level specification correction.

It refines routing semantics but does not break:
- existing expect_* semantics
- snapshot response shape
- raw-over-semantic precedence
- action execution model

## Implementation Notes

Follow-up work may include:
- prompt updates
- regression examples for sliders/toggles/pickers
- protocol examples showing correct routing
- telemetry on reduced unnecessary network inspections

## Open Questions

Questions for review:

1. Should action category be explicitly emitted as runtime metadata, or is heuristic inference acceptable only within the fallback mapping layer defined in the Action Type Emission contract?
2. Should side-effect actions permit optional log inspection alongside network hints?
3. Should local-state verification examples be added to core spec or examples appendix?

## Decision Requested

Adopt verification routing based on action type and remove implicit default escalation from missing UI diffs to network inspection.