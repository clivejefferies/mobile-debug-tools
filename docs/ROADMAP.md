# Mobile Debug MCP Roadmap

## Done

- Stronger State Verification
- Richer Element Identity
- Better Compose / Custom Control Semantics
- Verification Stabilization and Temporal Convergence
- Action Trace and Execution Observability
- Wait and Synchronization Reliability
- Actionability Resolution
- Environment Auto-Configuration and Toolchain Discovery
- Adjustable Control Support

## Todo

- UI-Tree Observation Performance
- Adjustable Control Precision Hardening
- Signal-Oriented Diagnostic Filtering
- Long Press Gesture
- Runtime Debugger Introspection
- Pinch to Zoom
- Advanced Trace Correlation and Analysis

# UI-Tree Observation Performance

**Status:** Spec draft — [Specification 019](specs/019-ui-tree-observation-performance/spec.md)

Measure physical hierarchy reads and their cost, then reduce the measured hot path while preserving fresh post-action and asynchronous UI evidence. Validate the change against the existing static journey and a controlled network-backed screen before claiming a speedup.

Exit criteria and performance gates are defined in Specification 019.

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
- Advanced Trace Correlation and Analysis

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
- Incremental / diff-based snapshot delivery (token-efficient)
- Focused snapshot scoping (subtree / target-based)
- Compose-aware wait robustness improvements
- Explicit interaction sequencing guidance (tap → wait → verify pattern)
- Exploration of optional action-level synchronization ergonomics (e.g. implicit stabilization or wait flags)

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
- Reduced need for manual sequencing by agents in stateful flows
- Reduced average snapshot size (tokens)

## Dependencies
Depends on:
- Stronger State Verification
- Richer Element Identity

Blocks or strengthens:
- Better Compose / Custom Control Semantics
- Advanced Trace Correlation and Analysis

---

# Verification Stabilization and Temporal Convergence

## Rationale
Real-world feedback exposed false-negative readiness failures caused by transient UI timing, even when target state had actually converged.

**Status:** Completed

Addresses friction where agents:
- fail readiness checks on transient timing races
- act on stale snapshots
- misclassify eventual success as timeout failure
- encounter lag between UI convergence and verification success

## Scope
- Bounded recheck before readiness failure
- Temporal debounce for transient state mismatches
- Verify-until-stable semantics for readiness checks
- Stability confirmation windows
- Snapshot freshness and convergence heuristics

## Expected Impact
Very high.

## Exit Criteria
- False-negative readiness failures materially reduced
- Stability confirmation logic implemented
- Benchmark async flows validate improved convergence detection
- Verification timing behavior documented in guardrails

## Success Metrics
- Higher first-pass verification success
- Lower false timeout failures
- Higher wait success rate
- Fewer retries caused by premature failure classification

## Dependencies
Depends on:
- Stronger State Verification
- Wait and Synchronization Reliability

Strengthens:
- Actionability Resolution
- Adjustable Control Support
- Recovery and replanning readiness

---

# Actionability Resolution

## Rationale
Reduces failures caused by interacting with discoverable but non-actionable UI nodes.

**Status:** Completed

Addresses cases where:
- visible text is not the true click target
- child nodes differ from actionable containers
- affordance exists but handler ownership is ambiguous

## Scope
- Actionable container resolution
- Executable-target preference rules
- Actionability confidence metadata
- Post-action state verification integration
- Geometry-aware fallback targeting for weak semantic surfaces (e.g. sliders without accessible nodes)

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
- Reduced need for empirical coordinate probing on custom controls

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

**Status:** Completed

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

# Adjustable Control Precision Hardening

## Rationale
Post-implementation feedback shows semantics exist, but fine-grained adjustable targeting and convergence still need hardening.

**Status:** Planned

Addresses friction around:
- slider thumb targeting precision
- tap vs drag adjustment strategy selection
- snapping and quantized convergence behavior
- repeated adjustment retries before landing on target value

## Scope
- Fine-grained slider targeting refinement
- Drag vs tap adjustment strategy heuristics
- Improved value snapping convergence
- Control-specific adjustment fallback policies
- Controlled search strategies for value convergence (e.g. binary / progressive adjustment)

## Expected Impact
High.

## Exit Criteria
- Benchmark slider flows reach target values with fewer retries
- Adjustment strategy selection validated across representative controls
- Reduced repeated-tap convergence failures

## Success Metrics
- Fewer retries for adjustable controls
- Higher first-attempt target value success
- Reduced control convergence failures

## Dependencies
Depends on:
- Adjustable Control Support
- Better Compose / Custom Control Semantics

Strengthens:
- Recovery readiness

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
- Advanced Trace Correlation and Analysis

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

**Status:** Completed

Semantics become more useful once:
- identity is stronger
- verification is stronger
- gestures are richer
- synchronization is more reliable
- action execution is more precise

## Scope
- Composite control traits
- Control role enrichment (`slider`, `stepper`, `dropdown`, `segmented_control`, `custom_adjustable`)
- Interaction contract metadata (`supported_actions`, `adjustable`, `state_shape`)
- Custom widget gesture affordance hints
- Semantic confidence annotations
- Compose-aware selectors for waits (merged semantics and element relationships)

## Expected Impact
High.

## Exit Criteria
- Semantic traits implemented for major custom control classes
- Interaction contracts surfaced in observation and resolution paths
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

# Runtime Debugger Introspection

## Rationale
Enables agents to move from symptom observation to runtime causal analysis by inspecting paused application state during debugging sessions.

**Status:** Planned

Addresses limitations where agents:
- observe UI failures but cannot determine runtime cause
- cannot inspect ViewModel or controller state
- lack access to local variables and stack context
- cannot reason about async execution state

## Scope
Debugger-assisted runtime inspection primitives:

```javascript
debugger.pause_state()
debugger.stack_trace()
debugger.locals()
debugger.inspect_object(object_id)
debugger.evaluate(expression)
debugger.threads()
```

Includes:
- stack frame inspection
- local variable inspection
- object graph traversal
- thread inspection
- expression evaluation
- platform abstraction over JDWP / LLDB
- bounded object expansion and summarization
- coroutine/task inspection support

Future exploration:
- controlled stepping support
- debugger-assisted recovery workflows

## Expected Impact
Very high.

Transforms debugging from:
- surface-level symptom detection

toward:
- root-cause-oriented runtime reasoning

## Exit Criteria
- Paused runtime state accessible through MCP
- Local variable inspection implemented
- Stack trace inspection implemented
- Object inspection primitives implemented
- Runtime inspection validated on representative Android flows
- Object expansion safeguards implemented
- Expression evaluation available with safety limits

## Success Metrics
- Lower mean time-to-root-cause
- Higher causal diagnosis accuracy
- Reduced debugging iteration loops
- Faster identification of state-management failures
- Improved async/concurrency failure diagnosis

## Dependencies
Depends on:
- Action Trace and Execution Observability
- Stronger State Verification
- Wait and Synchronization Reliability
- Signal-Oriented Diagnostic Filtering

Strengthens:
- Advanced Trace Correlation and Analysis
- Future autonomous recovery systems

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

# Advanced Trace Correlation

## Rationale
Very valuable for debugging,
but less critical than improving control success first.

Builds on the foundational Action Trace and Execution Observability capability by linking traces across UI, network, and logs.

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
