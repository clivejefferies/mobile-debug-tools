# Mobile Debug MCP Prioritized Roadmap

## Prioritization Criteria

Ordered by:

1. Impact on agent reliability  
2. Reduction in retries / brittleness  
3. Breadth of app coverage improved  
4. Implementation complexity vs payoff

## Program-Level Success Metrics
Track roadmap impact across releases using:

- Retry reduction rate (% fewer action retries per task)
- Element match success rate (% successful element targeting)
- Verification success rate (% expect_* checks passing first attempt)
- Custom control interaction success rate
- Gesture success rate
- Mean time to root cause during debugging
- Overall agent task completion rate

Primary KPI:
Higher task success with fewer retries.

---

# Priority 1 — Stronger State Verification

## Why first
Highest leverage improvement.

Most failures are not “can’t act,” they’re:
- uncertain state
- weak verification
- retry loops caused by inference

## Deliver
- Direct readable control values
- Expanded `expect_*` verification
- Move from inference to state introspection

## Expected Impact
Very high.

## Done Criteria
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
- Priority 4 — Better Compose / Custom Control Semantics
- Priority 5 — Pinch to Zoom verification
- Priority 6 — Action Trace Correlation

---

# Priority 2 — Richer Element Identity

## Why second
Directly reduces selector brittleness.

Improves:
- targeting stability
- repeatability
- agent confidence

## Deliver
- Stable IDs / test tags prioritization
- Selector confidence metadata
- Preferred selector hierarchy

## Expected Impact
Very high.

## Done Criteria
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
- Priority 3 — Long Press targeting reliability
- Priority 4 — Better Compose / Custom Control Semantics
- Priority 5 — Pinch to Zoom targeting

---

# Priority 3 — Long Press Gesture

## Why third
High utility, relatively low complexity.

Unlocks many currently awkward interactions:

- context menus
- hidden actions
- reorder handles
- press-and-hold controls

Broad usefulness.

## Deliver
New tool:

```json
long_press(element_id, duration_ms?)
```

Verification alignment:
- expect_context_menu
- expect_press_effect

## Expected Impact
High.

## Done Criteria
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
- Priority 2 — Richer Element Identity

Strengthens:
- Priority 4 semantics interaction contracts

---

# Priority 4 — Better Compose / Custom Control Semantics

## Why fourth
Important, but strengthened by priorities 1–3 first.

Semantics become more useful once:
- identity is stronger
- verification is stronger
- gestures are richer

## Deliver
- Composite control traits
- Control role enrichment (adjustable, expandable, selectable_group)
- Interaction contracts metadata
- Custom widget gesture affordance hints
- Semantic confidence annotations

## Expected Impact
High.

## Done Criteria
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
- Priority 1 — Stronger State Verification
- Priority 2 — Richer Element Identity
- Priority 3 — Long Press

---

# Priority 5 — Pinch to Zoom

## Why fifth
Valuable, but narrower than long press.

Applies mainly to:
- maps
- images
- canvases
- zoomable custom surfaces

Useful, but less universal.

## Deliver

```json
pinch_to_zoom(target, scale, center?)
```

Verification:
- expect_zoom_level
- expect_viewport_change

## Expected Impact
Medium-high.

## Done Criteria
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
- Priority 1 — Stronger State Verification
- Priority 2 — Richer Element Identity

---

# Priority 6 — Action Trace Correlation

## Why sixth
Very valuable for debugging,
but less critical than improving control success first.

Improves diagnosis more than task completion.

## Deliver
- Action correlation metadata
- UI/network/log linkage

## Expected Impact
Medium-high.

## Done Criteria
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
- Priority 1 — Stronger State Verification
- Priority 2 — Richer Element Identity

---

# Delivery Waves

## Dependency Summary
Foundational sequence:

Layer 1 (Foundations)
- Priority 1
- Priority 2

Layer 2 (Interaction Expansion)
- Priority 3 depends on 2
- Priority 4 depends on 1,2,3
- Priority 5 depends on 1,2

Layer 3 (Observability)
- Priority 6 depends on 1,2

## Wave 1 (Immediate)
- Stronger State Verification
- Richer Element Identity

Focus:
Make core loop more reliable.

---

## Wave 2
- Long Press
- Better Compose Semantics

Focus:
Expand interaction capability.

---

## Wave 3
- Pinch to Zoom
- Action Trace Correlation

Focus:
Advanced gestures + observability.

---

# Priority Stack Summary

Execution Order:
1. Stronger State Verification
2. Richer Element Identity
3. Long Press
4. Better Compose / Custom Control Semantics
5. Pinch to Zoom
6. Action Trace Correlation

Rationale:
- Priorities 1–2 harden the control/verify loop.
- Priorities 3–5 expand interaction capability.
- Priority 6 improves observability after control reliability matures.

---

## Explicitly Deferred
Still out of scope:

- Recovery planning logic
- Autonomous retry strategy
- MCP-level agent orchestration
- Autonomous recovery hinting (future consideration only)