# Specification: device readiness blockers

Status: approved. User accepted the revised specification with “ok, lets proceed”
in the current chat on 2026-11-04; implementation is authorised for this scope.
Intent: [approved intent](intent.md), user response “ok”, 2026-11-04.
Source: [issue #101](https://github.com/clivejefferies/mobile-debug-tools/issues/101).

## Behaviour

Keep launch dispatch, normalized UI stability, and device accessibility distinct.
Successful `start_app` / `restart_app` dispatch does not establish app visibility,
unlocked state, or input readiness. Existing success, verification, and
`observed_app.matchedTarget` fields retain their meanings. Device observations
must never upgrade dispatch success into proof that the app is usable.

Add `device_readiness` to launch/restart results, interaction action results,
`get_app_readiness`, `wait_for_app_ready`, and readiness-enabled
`wait_for_ui` / `wait_for_ui_change` results. Preserve it in compact and debug
responses, including failures after target resolution. Journey action steps use
the same representation. Ordinary waits without `requireReady` keep their
predicate semantics. No new tools or input parameters are introduced.

The additive object has:

- `wakefulness`: `awake | asleep | transitioning | unknown | unsupported`.
- `lock_state`: `locked | unlocked | unknown | unsupported`.
- `input_ready`: `false | null`. False means an observed device blocker; null
  means readiness is not established. Awake/unlocked alone never yields true.
- `blockers`: zero or more of `DEVICE_ASLEEP`, `DEVICE_LOCKED`,
  `DEVICE_TRANSITIONING`, `DEBUGGER_PAUSED`.
- `evidence`: at most eight entries containing `code`, `source`, and host
  epoch `captured_at_ms`. No raw command output or UI text.
- `limitations`: bounded codes for unavailable, unsupported, conflicting, or
  failed observations. Each axis has an explicit value even when unavailable.

Each successful native sample carries its own timestamp. An unknown axis has
no invented timestamp. Evidence is scoped to the explicitly resolved device
and current operation, with no cross-call cache. Observations describe their
capture time; they cannot guarantee the device remains unchanged afterward.

## Platform evidence

Android uses bounded, explicitly targeted ADB reads of `dumpsys power` and
`dumpsys window policy`. Parse recognized current-state fields only. Awake and
asleep require explicit wakefulness evidence; a wakefulness-change flag yields
transitioning. Dozing is treated as asleep for input readiness. Keyguard showing
means locked even if occluded; explicit non-showing means unlocked. Missing,
unrecognized, contradictory, or truncated fields produce unknown for the
affected axis. Device keyguard capability alone is not lock-state evidence.
Retain independent evidence when one probe fails. Unknown Android variants must
not be classified by text labels, screenshots, or command success alone.

iOS support is determined per signal and target, not by a blanket platform
assumption. Apple's `devicectl device info lockState` provides a lock-state
probe, but the tested iOS 26.4 simulator explicitly rejects it with CoreDevice
error 1001 and feature `com.apple.coredevice.feature.getlockstate`. That explicit
capability rejection yields unsupported for the lock axis; ordinary probe errors
yield unknown. A recognized successful structured response may establish lock
state only once its semantics and compatibility have been verified. Physical
iOS integration is outside this ticket's existing simulator-only lifecycle path;
the command's existence does not establish physical-device support in this MCP.

For the tested simulator, wakefulness remains unknown: display information is
available, but neither `simctl io enumerate` port power nor devicectl backlight
state reliably distinguished an accepted display-off command in this experiment.
Return `DEVICE_WAKEFULNESS_UNVERIFIED`, not an inferred awake/asleep state.
Simulator boot status, launch PID, SpringBoard labels, and a static tree do not
prove awake/unlocked state. No private iOS APIs, helper app, or security-setting
changes are introduced. See [iOS investigation](ios-investigation.md).

## Integration, precedence, and failure

Keep the existing `ReadinessSummary.state` enum and UI evidence unchanged for
compatibility, but a known device blocker prevents readiness-wait success even
if the UI appears settled. `get_app_readiness` may successfully report an
observed blocker; a readiness wait continues within its existing budget to allow
natural recovery. At expiry it returns `READINESS_TIMEOUT` with last evidence.
Managed debugger pause retains existing immediate `DEBUGGER_PAUSED` behaviour
and guard precedence. Combine available blockers without replacing debugger
session evidence or triggering a UI read while that guard blocks one.

Unsupported/unknown device observations do not prevent existing settled-UI wait
success; documentation must make clear that this still does not prove input
readiness. After observation failure, never reuse a previous known clear state
to claim the device is clear. A later fresh sample can establish recovery.

For actions, collect one post-action device sample within the existing action
budget, including verification mode `none`; do not add a UI-tree read for this
feature. Preserve dispatch outcomes on observation failure and expose unknown
with a limitation. A sleeping/locked result does not introduce a new input guard
or retry. Calls already blocked by the debugger retain their existing failure.
If target resolution fails, return unknown with a target-unavailable limitation.

Each native probe has a maximum 1,000 ms timeout, clipped to the remaining
operation budget. No additional timeout window, retry, detached subprocess, or
automatic device selection is allowed. Existing cancellation and child-process
cleanup apply. Do not begin a probe after budget expiry.

## Acceptance and verification

1. Reproduce launch while asleep/locked on a disposable Android emulator where
   practical; record dispatch outcome separately from device-state evidence.
2. Verify awake/unlocked, asleep, locked, transition/conflict, missing fields,
   probe failure, expiry, and recovery. Use real-device evidence for supported
   stable states and deterministic fixtures for fleeting transitions.
3. Verify a stable lock-screen tree cannot complete a readiness-enabled wait;
   unknown/unsupported remains explicit without changing ordinary predicates.
4. Verify managed debugger precedence, targeting, timestamp freshness, compact
   serialization, journey propagation, and absence of raw dumps in responses.
5. Run `npm run verify` and applicable `npm run test:device`; report exact device,
   server build, outcomes, cleanup, and unrun platforms. No claim of iOS state
   detection is made without matching runtime evidence.

## Ownership, security, and investigation evidence

Affects readiness services/contracts, action execution/serialization, lifecycle
results, tool descriptions, tools documentation, README, and changelog. Reuse
existing budgets, subprocess helpers, and resolved-device context. Raw system
dumps can include private metadata: parse locally and retain only enumerated
flags. Never unlock, wake, or alter security settings automatically. Verification
may sleep/wake a disposable emulator and must restore its starting state; do not
change the user's physical phone for reproduction.

On 2026-11-04, connected MCP discovery reported an Android 16 emulator
`emulator-5554`, a physical Android phone, and no booted iOS simulator. Read-only
ADB probes on the emulator exposed `mWakefulness=Awake`,
`mWakefulnessChanging=false`, and keyguard `showing=false` / `mIsShowing=false`.
These establish available baseline fields only; sleeping/locked reproduction
and updated-server verification remain unrun. Local sandboxed simctl access
failed to connect to CoreSimulator, so it supplies no iOS runtime evidence.

The user approved this complete revised contract, including additive fields,
known-blocker wait gating, and per-signal iOS unknown/unsupported behaviour,
with “ok, lets proceed” on 2026-11-04.
