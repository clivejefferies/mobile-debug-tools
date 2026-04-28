# Mobile Debug MCP Roadmap

## Planning Principles

Ordered by:


1. Impact on agent reliability  
2. Reduction in retries / brittleness  
3. Breadth of app coverage improved  
4. Implementation complexity vs payoff

## Capability Status Definitions

- **Completed**  
  Capability implemented and considered part of the baseline platform.

- **Spec Ready**  
  Capability design or RFC is mature and implementation-ready, but not yet delivered.

- **Planned**  
  Capability is prioritized on the roadmap, but detailed specification and/or implementation work remains ahead.

## Program-Level Success Metrics
Track roadmap impact across releases using:

- Retry reduction rate (% fewer action retries per task)
- Element match success rate (% successful element targeting)
- Verification success rate (% expect_* checks passing first attempt)
- Wait success rate for asynchronous UI flows
- Custom control interaction success rate
- Gesture success rate
- Mean time to root cause during debugging
- Overall agent task completion rate

Primary KPI:
Higher task success with fewer retries.

---

# Roadmap Status Overview

## Completed Capabilities

- Stronger State Verification — Complete (Foundational verification layer shipped)
- Richer Element Identity — Complete (Identity and selector confidence foundations shipped)

## Current Focus

- Wait and Synchronization Reliability
- Actionability Resolution

## Upcoming Work

- Adjustable Control Support
- Better Compose / Custom Control Semantics
- Signal-Oriented Diagnostic Filtering
- Long Press Gesture

## Later Horizon

- Pinch to Zoom
- Action Trace Correlation

---

# Stronger State Verification

## Rationale
Highest leverage improvement.

**Status:** Completed

Most failures are not “can’t act,” they’re:
- uncertain state
- weak verification
- retry loops caused by inference

## Scope
- Direct readable control values
- Expanded `expect_*` verification
- Move from inference to state introspection

## Expected Impact
Very high.

## Exit Criteria
- Control state readable for core widgets (toggle, slider, input, dropdown)
- New expect_* state verifiers implemented
- Agents can verify state without visual inference in representative flows
- Documentation and snapshot response shape updated

## Success Metrics
- 30%+ retry reduction on stateful tasks
- Higher first-pass verification success
- Reduced false positive verifications

## Dependencies
Blocks or strengthens:
- Better Compose / Custom Control Semantics
- Pinch to Zoom
- Action Trace Correlation

---

# Richer Element Identity

## Rationale
Directly reduces selector brittleness.

**Status:** Completed

Improves:
- targeting stability
- repeatability
- agent confidence

## Scope
- Stable IDs / test tags prioritization
- Selector confidence metadata
- Preferred selector hierarchy

## Expected Impact
Very high.

## Exit Criteria
- Stable selector preference order implemented
- Test tags/resource IDs surfaced where available
- Selector confidence metadata available
- Structural fallback selectors defined

## Success Metrics
- Higher element match rate
- Reduced selector drift failures
- Lower retargeting retries

## Dependencies
Blocks or strengthens:
- Long Press Gesture
- Better Compose / Custom Control Semantics
- Pinch to Zoom

---

# Wait and Synchronization Reliability

## Rationale
Reliable async synchronization is foundational for agent success and should precede gesture expansion.

**Status:** Spec Ready

Addresses failures where agents:
- skip UI waits after actions
- rely on network/log signals too early
- struggle with in-place UI updates
- misread stale UI snapshots

## Scope
- UI-first synchronization policy guidance
- wait_for_ui_change (hierarchy diff based waiting)
- Structured loading state detection
- Snapshot revision / staleness metadata
- Focused snapshot views / incremental snapshot diffs
- Compose-aware wait robustness improvements

## Expected Impact
Very high.

## Exit Criteria
- wait_for_ui_change implemented
- Loading state detection available for representative controls
- Snapshot revision or staleness metadata exposed
- Focused or diff-oriented snapshots validated in benchmark flows
- UI-first sync guidance added to spec guardrails
- In-place update waits validated on benchmark flows

## Success Metrics
- Reduced missed async UI transitions
- Fewer retries caused by premature actions
- Higher wait success rate for dynamic UI flows
- Lower fallback usage to network/log checks

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity

Blocks or strengthens:
- Better Compose / Custom Control Semantics
- Action Trace Correlation

---

# Actionability Resolution

## Rationale
Reduces failures caused by interacting with discoverable but non-actionable UI nodes.

**Status:** Planned

Addresses cases where:
- visible text is not the true click target
- child nodes differ from actionable containers
- affordance exists but handler ownership is ambiguous

## Scope
- Actionable container resolution
- Executable-target preference rules
- Actionability confidence metadata
- Post-action state verification integration

## Expected Impact
High.

## Exit Criteria
- Actionable target resolution implemented
- Preference rules defined for executable containers over leaf nodes
- Actionability confidence surfaced
- Benchmark flows show reduced false taps and submit ambiguity

## Success Metrics
- Reduced mis-targeted action failures
- Lower retarget retries
- Higher first-attempt action success

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity
- Wait and Synchronization Reliability

Blocks or strengthens:
- Adjustable Control Support
- Better Compose / Custom Control Semantics

---

# Adjustable Control Support

## Rationale
High leverage improvement for sliders and parameterized controls.

**Status:** Planned

Addresses friction around:
- coordinate-calibrated slider interaction
- snapping and quantized controls
- weak state confirmation after adjustment

## Scope
New semantic control support:

```json
set_slider_value(target, value, tolerance?)
```

Includes:
- semantic adjustable control manipulation
- read-back verification loop
- tolerance-aware value setting
- fallback coordinate calibration only when needed

## Expected Impact
High.

## Exit Criteria
- Adjustable control primitive implemented
- Verification loop reads and confirms resulting values
- Tolerance model defined
- Benchmark slider/custom control flows validated

## Success Metrics
- Higher custom control interaction success rate
- Fewer retries adjusting controls
- Reduced coordinate-guessing failures

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity
- Actionability Resolution

Blocks or strengthens:
- Better Compose / Custom Control Semantics
- Pinch to Zoom

---

# Signal-Oriented Diagnostic Filtering

## Rationale
Improves observability by separating causal signals from diagnostic noise.

**Status:** Planned

Addresses friction from:
- noisy log streams
- weak signal extraction
- difficult action-to-signal attribution

## Scope
- Structured diagnostic classification
- Noise filtering heuristics
- Signal relevance scoring
- App vs system event tagging

## Expected Impact
High.

## Exit Criteria
- Diagnostic signal classification model defined
- Noise filtering available in representative flows
- Relevant action-linked signals surfaced separately from background noise
- Debug workflows validated with filtered signals

## Success Metrics
- Lower time-to-root-cause
- Faster identification of relevant action signals
- Reduced diagnostic ambiguity

## Dependencies
Depends on:
- Stronger State Verification
- Wait and Synchronization Reliability

Strengthens:
- Action Trace Correlation

---

# Long Press Gesture

## Rationale
High utility, relatively low complexity.

**Status:** Planned

Unlocks many currently awkward interactions:

- context menus
- hidden actions
- reorder handles
- press-and-hold controls

Broad usefulness.

## Scope
New tool:

```json
long_press(element_id, duration_ms?)
```

Verification alignment:
- expect_context_menu
- expect_press_effect

## Expected Impact
High.

## Exit Criteria
- long_press tool implemented across supported platforms
- Duration defaults and overrides supported
- Verification patterns for long press outcomes defined
- Included in action capability model

## Success Metrics
- Increased hidden/control-surface interaction coverage
- Reduced dead-end interaction failures
- Long press task success rate tracked

## Dependencies
Depends on:
- Richer Element Identity

Strengthens:
- Better Compose / Custom Control Semantics

---

# Better Compose / Custom Control Semantics

## Rationale
Higher priority after agent feedback exposed custom control semantics as a core reliability gap, not a later optimization.

**Status:** Spec Ready

Semantics become more useful once:
- identity is stronger
- verification is stronger
- gestures are richer
- synchronization is more reliable
- action execution is more precise

## Scope
- Composite control traits
- Control role enrichment (adjustable, expandable, selectable_group)
- Interaction contracts metadata
- Custom widget gesture affordance hints
- Semantic confidence annotations
- Compose-aware selectors for waits (merged semantics and element relationships)

## Expected Impact
High.

## Exit Criteria
- Semantic traits implemented for major custom control classes
- Interaction contracts surfaced in snapshot model
- Confidence model defined for derived semantics
- Custom control manipulation success validated in benchmark flows

## Success Metrics
- Higher custom control interaction success rate
- Fewer retries on non-standard widgets
- Reduced semantic ambiguity failures

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity
- Wait and Synchronization Reliability
- Actionability Resolution
- Adjustable Control Support
- Long Press Gesture

---

# Pinch to Zoom

## Rationale
Valuable, but narrower than long press.

**Status:** Planned

Applies mainly to:
- maps
- images
- canvases
- zoomable custom surfaces

Useful, but less universal.

## Scope

```json
pinch_to_zoom(target, scale, center?)
```

Verification:
- expect_zoom_level
- expect_viewport_change

## Expected Impact
Medium-high.

## Exit Criteria
- pinch_to_zoom implemented
- Zoom in/out flows supported
- Verification primitives for viewport or zoom state available
- Gesture integrated into action model

## Success Metrics
- Successful execution across zoomable surfaces
- Reduced failures on map/image workflows
- Gesture success rate tracked

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity

---

# Action Trace Correlation

## Rationale
Very valuable for debugging,
but less critical than improving control success first.

**Status:** Planned

Improves diagnosis more than task completion.

## Scope
- Action correlation metadata
- UI/network/log linkage

## Expected Impact
Medium-high.

## Exit Criteria
- Action correlation model defined
- UI/network/log linkage captured for representative actions
- Correlation metadata exposed to agents
- Debugging workflows validated with trace linkage

## Success Metrics
- Lower time-to-root-cause
- Faster diagnosis of partial failures
- Improved action causality attribution

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity
- Wait and Synchronization Reliability

---

# Roadmap Sequence

## Dependency Summary

Foundation
- Stronger State Verification
- Richer Element Identity

Synchronization & Actionability
- Wait and Synchronization Reliability
- Actionability Resolution

Control Precision & Observability
- Adjustable Control Support
- Signal-Oriented Diagnostic Filtering

Interaction Expansion
- Long Press Gesture
- Better Compose / Custom Control Semantics
- Pinch to Zoom

Deep Observability
- Action Trace Correlation

## Wave 1 (Current Focus)
- Stronger State Verification
- Richer Element Identity
- Wait and Synchronization Reliability
- Actionability Resolution

Focus:
Make core loop more reliable.

---

## Wave 2 (Control Precision + Diagnostics)
- Adjustable Control Support
- Better Compose / Custom Control Semantics
- Signal-Oriented Diagnostic Filtering

Focus:
Improve control precision, custom control semantics, and signal observability.

---

## Wave 3 (Interaction Expansion)
- Long Press Gesture

Focus:
Expand interaction capability after core control reliability is improved.

---

## Wave 4 (Advanced Gestures + Deep Observability)
- Pinch to Zoom
- Action Trace Correlation

Focus:
Advanced gestures + deep observability.

---

# Roadmap Ordering

Roadmap Ordering:
1. Stronger State Verification
2. Richer Element Identity
3. Wait and Synchronization Reliability
4. Actionability Resolution
5. Adjustable Control Support
6. Better Compose / Custom Control Semantics
7. Signal-Oriented Diagnostic Filtering
8. Long Press Gesture
9. Pinch to Zoom
10. Action Trace Correlation

Rationale:
- Early roadmap items harden state, targeting, synchronization, action execution.
- Mid roadmap items improve control precision and signal observability.
- Later interaction-focused items expand interaction coverage.
- Final observability work deepens debugging observability.

---

## Future Considerations
Still out of scope:

- Recovery planning logic
- Autonomous retry strategy
- MCP-level agent orchestration
- Autonomous recovery hinting (future consideration only)
