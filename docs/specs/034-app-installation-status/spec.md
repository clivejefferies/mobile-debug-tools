# Specification: trustworthy app installation status

Status: approved by user “ok” in this chat on 2026-11-05; implementation authorised.
Intent: [approved scope](intent.md), user response “yes”, 2026-11-05.
Source: [issue #98](https://github.com/clivejefferies/mobile-debug-tools/issues/98).

## Behaviour and scope

Installation is an observation about one app on one device, not a claim that
the app is running, visible or ready. Fix inventory and Android system-status
reporting without adding a tool or broadening device support. Existing iOS
inventory covers simulators; physical iOS installation checks remain unsupported.

`list_devices` retains its `{ devices: DeviceInfo[] }` wrapper. Publish the
already-handled optional `appId: string` input alongside optional `platform`.
Use only that explicit app ID for inventory checks; do not silently substitute
environment configuration. Reject blank/invalid identifiers before native calls.
Accept conventional Android package and iOS bundle identifiers (letters, digits,
underscores, hyphens and periods); use argument arrays, never shell interpolation.

Every returned device gains `appInstallation`:

```ts
{
  status: 'installed' | 'absent' | 'unknown';
  appId: string | null;
  deviceId: string;
  scope: 'android-current-user' | 'ios-simulator';
  checkedAt: string | null; // UTC ISO timestamp when a native check finished
  reason?: 'APP_ID_NOT_PROVIDED' | 'DEVICE_UNAVAILABLE' |
    'CHECK_FAILED' | 'UNRECOGNIZED_RESPONSE';
}
```

`installed` and `absent` require a successful authoritative query. Unknown
always includes a reason. `checkedAt` is null when no native check ran.
Keep legacy `appInstalled: true/false` only for confirmed installed/absent;
omit it for unknown. This corrects false negatives while retaining boolean
compatibility for conclusive checks. It intentionally changes callers that
incorrectly treat a missing boolean as confirmed absence; document this clearly.
Do not emit raw native errors or app-container paths in this diagnostic object.

## Platform evidence

Android: query `pm path <appId>` with explicit serial. A successful result
containing valid package-path lines confirms installed. Successful empty output
confirms absence for the device's current Android user; other Android users and
work profiles are outside that observation. A silent nonzero `pm path` result may be followed by a successful
`pm list packages <appId>` query: exact membership confirms installation and
absence from a valid returned package list confirms absence. Otherwise nonzero
exit, timeout, disconnected,
offline or unauthorized device means unknown. Unexpected nonempty output means
unknown, never absent. Metadata failures must not manufacture absence.

iOS: for a simulator known to be booted, query `simctl listapps <udid>` using
its property-list output converted to JSON by macOS `plutil`, and check exact
bundle-identifier membership. A successfully parsed
app dictionary confirms installed or absent. Failed queries, malformed responses,
and simulators without confirmed booted state mean unknown. Replace the current
`get_app_container` failure-to-absence inference. Do not boot simulators as a
side effect of inventory. Preserve existing simulator inventory ordering.

## System status and selection

`get_system_status` keeps its input schema and existing toolchain status fields.
Use the existing `MCP_TARGET_PACKAGE`, then `MCP_TARGET_APP_ID` precedence for
Android app context. Add top-level `appInstallations`, an array of the same
per-device observations for enumerated Android devices, including unavailable
devices as unknown. With no app context, observations are unknown with null app ID.

Legacy top-level `appInstalled` is present only when exactly one Android device
was enumerated and its result is conclusive. With multiple devices, no devices,
missing context or failed query, omit the global boolean. Never run an untargeted
package query. Report confirmed absence as a device-specific issue; report query
failures as check failures, not “app not installed”. No iOS app check is implied
by Android system-status fields. Invalid environment app IDs produce unknown
CHECK_FAILED observations and a configuration issue, without a subprocess.

Device selection may prefer only confirmed installed results for the requested
app. Retain existing remaining preference rules; unknown must not become an
absence assertion. Include check context in ambiguity diagnostics. Do not reuse
installation observations across apps, devices or inventory calls.

## Failure, ownership and privacy

Each native installation query has a five-second maximum, capped by any enclosing
operation deadline, using existing subprocess cleanup. Deadline expiry or interrupted
checks cannot yield installed/absent. No retries, persistent cache, background
processes or changed cancellation protocol. Partial inventory retains device rows
and marks failed checks unknown. Whole inventory-enumeration failures retain the
existing empty-list behaviour; this does not establish app absence.

Checks are read-only: no installs, uninstalls, launches, unlocks or settings changes.
Return only requested app identity, device identity and bounded status metadata;
discard unrelated iOS app inventory after exact membership lookup.

## Acceptance and verification

1. Reproduce Android's missing-context false result on the current checkout;
   compare explicit installed and absent app checks on available devices. Record
   limits preventing reconstruction of the original agent session.
2. Verify installed/running, absent, missing context, multiple devices, query
   failures, malformed output and unavailable devices without false absence.
3. Verify iOS installed/absent on a booted simulator separately; shutdown and
   failed-listapps paths remain unknown. Physical iOS is explicitly unsupported.
4. Test schemas, dispatch, serialized omission of unknown booleans, system-status
   aggregation, and selection consumers together using deterministic fake tooling.
5. Update tool descriptions, management/system guides and changelog. Run
   `npm run verify`, `npm run test:device`, and focused calls against the updated
   server. Report exact device/build evidence and unrun coverage separately.

Initial prerequisites: Android emulator and Pixel 9 Pro are connected; no iOS
simulator is currently booted. Native inventory required sandbox escalation.
These are readiness observations, not verification of this proposed behaviour.
