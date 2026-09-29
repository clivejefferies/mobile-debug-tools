---
name: mobile-debug-mcp
description: Use mobile-debug MCP to inspect, interact with, and verify any Android or iOS app on a device or emulator.
metadata:
  author: mobile-debug-mcp contributors
  version: "1.1"
---

# Mobile-debug MCP usage

Use mobile-debug MCP when a task needs evidence from a running Android or iOS app. Identify the device and the state or behaviour to check, then choose the smallest observation or action that can establish it. A successful tool call confirms only what that tool reports; check the resulting app state before claiming an outcome.

## Choose the lightest evidence that proves the claim

- Prefer a screenshot for routine visual navigation, layout checks, and visible
  outcomes that can be established from the image.
- Use UI-tree reads and accessibility assertions such as `expect_element_visible`,
  `expect_state`, or `wait_for_ui` when reliable element selection or a structured
  property check is required. An image alone does not establish accessibility
  properties such as enabled state.
- Use a debug snapshot when an ordinary observation does not explain a failure or multiple kinds of evidence are needed together.
- Use logs or network activity for claims about errors or requests. Correlate them with the relevant action and time window; they do not establish what the user saw.
- Use platform shell commands only for device or system operations that the MCP tools cannot expose. Treat shell output as evidence of that operation, not of the app's visible state.

Choose one observation that proves the required outcome. Avoid automatically
reading the UI tree after a screenshot or taking a screenshot after a sufficient
structured assertion.

## Keep Android inspection APK-free

Use the standard ADB path for Android inspection. Do not install or enable a
helper APK, experimental UI-tree bridge, or Appium server to improve latency
unless the user explicitly requests that approach. The normal hierarchy dump
can take several seconds; account for this rather than treating it as a fast
poll. Compressed dumps can omit nodes and should not be assumed faster.

## Keep interaction fast

Treat each MCP call as a round trip and use the fastest path that still proves
the behaviour. For an interaction, prefer this sequence:

1. Observe the current screen or wait for a uniquely identifiable target if its presence is uncertain.
2. Perform the requested action using a stable selector or element id when available.
3. Check the specific resulting state once it has had time to occur.

Do not wait before every action when its target and current state are already
known. Do not poll unchanged screens. Set bounded assertion timeouts that cover
the expected app transition plus a complete fresh observation and a margin.
For Android ADB tree reads taking 2–3 seconds, start with a 5-second timeout for
a simple assertion; allow more when loading or repeated observations are
required. A 2-second timeout cannot reliably accommodate a 3-second tree read.
Adjust to measured device latency and supported tool limits. Report an
observation timeout separately from evidence that a control is absent.

Use compact responses for routine actions. If action dispatch is reliable but
verification is slow or unavailable, dispatch with verification disabled and
verify at meaningful checkpoints with one focused accessibility assertion or
screenshot. Do not assume `light` verification is faster: use it only when it
has returned useful results reliably on the current MCP version and device.

Prefer a stable element selector when it is already known and valid. For a
clearly identifiable visual target, use coordinates from a fresh screenshot
without requiring a tree read solely to rediscover it. If the target is
ambiguous or a semantic check is required, resolve it from the hierarchy.
Reacquire coordinates after scrolling,
changing orientation, switching screens, or opening a system surface.

Element discovery can be the slowest part of a journey. Avoid repeated
`find_element` calls for the same screen: resolve a control once, use the
returned selector or coordinates while that screen is unchanged, and verify
the resulting state before continuing. If a query fails, inspect the current
screen once before retrying; controls represented only by icons may not have a
matching visible text label.

When the MCP offers a journey or batch action, use it only when its steps can
express the needed observable checks and it returns enough evidence to report
the outcome. Measure the whole journey and compare equivalent steps on the same
device; do not infer a performance improvement from a single fast action.

## Match the evidence to the claim

For a state change, check the state after the action rather than inferring it
from successful dispatch. For an asynchronous update, start a fresh observation
after the relevant event and wait for the expected condition within a bounded
timeout. If an accessibility tree appears stale or incomplete, use another
appropriate observation such as a screenshot and report the discrepancy.

For behaviour outside the app's foreground screen, inspect the relevant system
surface or device state. For content that cannot be established visually, such
as audio output, use a suitable direct check or state that it was not verified.

## Report evidence precisely

State the device, actions taken, observed result, evidence source, and any
untested scope. Distinguish an observed outcome from an inference. Do not say
a feature works solely because the build compiled or an MCP action returned
success.
