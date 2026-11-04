# iOS readiness investigation — 2026-11-04

## Findings

Blanket iOS unsupported was not justified by the initial sandbox failure.
Running the probes outside the sandbox established an actual capability
boundary, separately from tool-access failures.

Apple's installed `devicectl` documents `device info lockState` as a read-only
lock-state query, and `device info displays` supplies structured backlight
information. Its help documents JSON output as the automation interface.
[Apple's device command-line documentation](https://developer.apple.com/documentation/xcode/interacting-with-devices-using-the-command-line)
is the upstream reference. This investigation relies on actual local command
help and output for the conclusions below.

## Environment and results

Target: iPhone 17 Pro simulator, UDID
`F9243BAF-62A8-4990-8A99-17F527F56FDA`, listed as iOS 26.4.
CoreDevice CLI version: `651.32`; JSON version: 5.
No physical iOS device was listed by `devicectl list devices`.
No server implementation was changed or tested.

| Probe | Observed result | Meaning |
| --- | --- | --- |
| `xcrun simctl list devices booted` outside sandbox | No booted simulators initially | Initial runtime state only |
| `xcrun simctl boot <UDID>` / `bootstatus <UDID> -b` | Boot succeeded; later bootstatus confirmed booted | Runtime available |
| `xcrun devicectl device info lockState --device <UDID> --timeout 10 --json-output <path>` | CoreDevice error 1001, feature `com.apple.coredevice.feature.getlockstate`, capability not supported | Explicit lock-probe unsupported on this target/toolchain |
| `xcrun devicectl device info displays --device <UDID> --timeout 10 --json-output <path>` | Per-display backlight unknown; top-level backlight `activeOn` after boot | Does not establish lock state |
| `xcrun simctl io <UDID> enumerate` | Display ports report power On | Port-level evidence only |
| `xcrun simctl io <UDID> screenConfig --display 1 power off` followed by display probes | Command accepted; display ports still On; devicectl top-level `activeOn` | These probes did not distinguish the commanded display-off state |
| Repeat display-off experiment after bootstatus completed | Baseline and off JSON both `activeOn` | No reliable sleep inference from this experiment |
| `screenConfig --display 1 power on`, then `simctl shutdown <UDID>` | Both completed successfully | Restored original shutdown state |

The display-off command is not independently verified OS sleep or lock. The
experiment disproves treating command acknowledgement or port power as sufficient
readiness evidence; it does not establish that every iOS display API is unusable.
Transient timing and simulator-specific semantics remain limitations.

## Proposed specification correction

- Explicit unsupported is per axis and target, established by capability evidence.
- Probe failures or uninterpretable observations yield unknown.
- On this simulator: lock state unsupported through CoreDevice; wakefulness
  unknown with an unverified-signal limitation.
- Physical iOS lock detection has an Apple CLI route, but no physical iOS device
  was available to validate output or locked/unlocked transitions. The repository's
  current iOS discovery/lifecycle path is simulator-based; extending that is a
  separate scope decision.
- No private API fallback, app instrumentation, automatic unlock, or security
  changes are proposed.

This is investigation evidence, not implementation verification or proof of
all iOS runtimes. Real lock/unlock transitions and true sleep recovery remain
unrun on iOS.
