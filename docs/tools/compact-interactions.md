# Compact interaction results

[Tool reference](TOOLS.md)

Use `responseMode: "compact"` on tap, tap_element, swipe, scroll_to_element,
type_text, press_back, start_app, restart_app and run_journey. Individual actions
still default to debug; journeys still default to compact. Other tools retain
their existing response contracts.

Compact results preserve action outcomes, delivery/verification status, failure
codes and retryability, device-readiness blockers/limitations and correlation IDs.
They summarize condition observations and state-delta counts instead of returning
full trees or changed elements. `observed_state.status` is `observed` only for
fresh same-device evidence acquired after dispatch; otherwise it is `unknown`
with a reason. A precondition tree never establishes the resulting UI. A fingerprint
observation does not identify a screen or prove the intended outcome. Existing
`verification` semantics are unchanged and separate from observation freshness.

## Read the original result without replay

Every executed compact action/journey step and journey supplies `diagnostics`:

```json
{"session_id":"UUID","result_id":"UUID","available":true}
```

Call `get_interaction_diagnostics({"sessionId":"UUID","resultId":"UUID"})`.
It returns `{"success":true,"result":{...}}` with the retained original payload,
including full evidence and internally available failure details. This tool performs
no device action or observation. It does not acquire additional debug snapshots
that were not requested originally; use debug mode at execution time for those.

Retention is in process memory, at most ten minutes, 100 results, 16 MiB total,
and 1 MiB per entry. Oldest completed entries are evicted first; reads do not extend
expiry. Oversized originals report `available:false, reason:"RESULT_TOO_LARGE"`.
Lookup failure returns `success:false, error:{code,message}`. Codes are
`INVALID_ARGUMENT`, `SESSION_MISMATCH`, and `RESULT_UNAVAILABLE` (expired, evicted,
unknown or restarted). Do not automatically replay input when diagnostics expire.
Payloads may include private UI text and errors; compact mode is not redaction.
Nothing is persisted to disk by this cache.

## Output bounds and compatibility

The final compact action text is at most 1,280 UTF-8 bytes plus device-ID bytes.
Journeys have a base budget of 1,280 bytes plus 1,280 per supplied step and caller
step-ID/device-ID occurrences (their UTF-8 JSON wire encoding, including necessary
escapes). Optional summaries may be omitted with
`truncated:true`; resulting state becomes unknown if its summary must be removed.
Caller IDs, outcomes, blockers and diagnostics references are preserved. Token
estimates in development reports use ceil(bytes/4), not tokenizer measurements.

Compact clients that inspected full evidence timestamps/observations, condition
UI trees or state-delta elements must use the diagnostics lookup instead. Evidence
session/action IDs still work with observation tools' `actionRef`. Debug output
remains available with its original detailed shape. Journey child diagnostics are
retained after shared verification and final evidence refresh.
