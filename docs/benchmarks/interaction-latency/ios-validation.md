# Spec 018 iOS device validation

Validated on 27 September 2026 with the booted iPhone Air simulator (iOS 26.4.1).

- `npm run test:device` passed all six Android and iOS screenshot, log, and UI-tree smoke checks.
- Over a spawned stdio MCP server, `start_app` launched Settings with `light`/`compact` and returned a fresh UI observation.
- A selector-based `tap_element` opened General with `light`/`compact`; its result included an available state delta.
- `run_journey` used two selector taps to return to General and open About, then asserted a visible `Model Name` label. All three steps passed with `light`/`compact`.
- A separate `full`/`debug` selector tap returned to General and reported a fresh observation. A `none`/`compact` selector tap reopened About without requesting post-action verification; a separate UI-tree read confirmed the destination.

The performance benchmark and its fixture are Android-only. These iOS checks exercised the interaction contract on a system app; they did not measure latency on an iOS app with network requests.
