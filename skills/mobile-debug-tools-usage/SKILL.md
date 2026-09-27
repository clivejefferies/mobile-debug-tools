---
name: mobile-debug-mcp
description: Verify Android app behaviour efficiently with mobile-debug MCP, especially session playback, background work, and notifications. Use for emulator/device QA; do not use for implementation-only checks.
metadata:
  author: modul8-team
  version: "1.0"
---

# Mobile-debug MCP verification

Use mobile-debug MCP to make a product claim observable on a real device or emulator. A successful tap proves only that the input was delivered; verify the resulting UI, notification, or persisted state before reporting success.

## Choose the lightest evidence that proves the claim

- Use an accessibility assertion such as `expect_element_visible` or
  `wait_for_ui` for an accessible label, enabled state, or changed control.
- Use a screenshot when visual layout, system UI, or notification content matters.
- Use a debug snapshot only when the screen does not explain a failed action or an accessibility-tree assertion is needed.
- Use Android shell commands only for device navigation or system surfaces that MCP cannot expose. Do not treat shell output as proof of user-visible behaviour.

Avoid repeated screenshots and snapshots when a targeted accessibility assertion is enough.

## Keep interaction fast

Treat each MCP call as a round trip and use the fastest path that still proves
the behaviour. Prefer the following sequence:

1. Wait for one stable, uniquely identifiable control.
2. Tap its returned element id.
3. Wait for the specific resulting state.

Do not wait before every tap when the current screen and element id are already known. Do not poll unchanged screens. Use short timeouts for ordinary controls; reserve longer waits for known asynchronous work such as model initialisation or network calls.

Use compact responses for routine actions. If action dispatch is reliable but
verification is slow or unavailable, dispatch with verification disabled and
verify at meaningful checkpoints with one focused accessibility assertion or
screenshot. Do not assume `light` verification is faster: use it only when it
has returned useful results reliably on the current MCP version and device.

Prefer a stable element selector when the accessibility tree exposes one. Use
coordinates only when needed, and take a fresh screenshot immediately before a
coordinate tap on system UI, notifications, or any screen where layout may have
changed. Never reuse coordinates after expanding/collapsing a notification,
changing orientation, or switching screens.

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

## Session playback checks

For a claimed playback start, observe a running timer or Pause state after Play. For a claimed pause, observe Resume and unchanged elapsed time. For a claimed stop, observe that playback ends and the notification disappears.

For background playback, press Home, open the notification shade, and verify
the notification title, progress/status, and available actions. Expand the
session notification if necessary, then capture its current layout before
tapping an action. Exercise each action needed for the change and observe its
result: Pause becomes Resume; Resume returns to active playback; Stop ends
playback and clears the notification. After each action, reacquire the current
screen state before using another coordinate.

Do not claim spoken guidance was verified unless audio output was actually inspected. A running timer or active notification verifies playback state, not audible wording.

## Report evidence precisely

State the device journey, observed result, and any untested scope. Mention whether evidence came from an accessibility assertion, screenshot, or system notification. Do not say a feature works solely because the build compiled or an MCP action returned success.
