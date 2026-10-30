# Intent: Android heap dump capture

Originator: clivejefferies, through GitHub roadmap issue #69 and the current conversation.
Date: 2026-10-30. Status: parked; intent not approved.
Source: [issue #69](https://github.com/clivejefferies/mobile-debug-tools/issues/69), roadmap priority 6 of 9.

## Problem and outcome

MCP clients investigating Android memory growth and out-of-memory failures need
a heap dump they can inspect with external analysis tools. Provide capture of a
supported running Android app's heap and return a local artifact with device,
app, capture-time, and artifact-path metadata.

## Scope and success criteria

- Capture and retrieve an Android heap dump for an explicitly targeted app/process.
- Report device, app/process identity, capture timing, and the local artifact path.
- Detect unsupported configurations and report failed, cancelled, and timed-out
  captures clearly.
- Bound capture work and clean up capture-owned temporary resources.
- Verify successful artifact retrieval on a supported Android fixture, alongside
  meaningful failure and cleanup checks.

## Exclusions and open decisions

Exclude iOS capture, deep heap analysis, leak diagnosis, automatic uploads, and
changes to app behaviour or permissions to enable capture.

Specification must resolve supported app/device configurations, capture backend
(including whether optional Android CLI tooling is useful), process selection,
tool contracts, limits, cancellation, concurrency, artifact retention, privacy,
and device-verification prerequisites. Heap contents can include sensitive app
data; capture and artifact handling must make their ownership explicit.

## Approval

The user switched to Android runtime debugger work before approving this intent.
Heap capture remains parked pending explicit agreement on the complete intent. No specification or
implementation approval is recorded.
