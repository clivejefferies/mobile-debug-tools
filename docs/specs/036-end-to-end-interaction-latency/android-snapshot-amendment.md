# Android debug snapshot tree reuse

Status: accepted on 2026-11-10. The user replied “yes” when asked to approve
this amendment in this chat.

The [ticket #100 measurements](../../benchmarks/end-to-end-latency/investigation.md)
recorded 36 physical read attempts across nine successful Android debug snapshots
with screenshots and logs disabled. Eighteen reads failed before recovery. The
snapshot median was 4.19 s. The snapshot currently starts a tree read and a
fingerprint request in parallel, and the Android fingerprint request reads its
own tree. The Android run ended before the planned tenth sample per case.

## Proposed behavior

For `capture_debug_snapshot` on a resolved Android target, collect one fresh
tree using the existing acquisition path. Return that tree in `raw.ui_tree` and
derive `raw.fingerprint` from the same tree using the existing Android hash
algorithm and its post-tree activity lookup. Preserve the independent Android
`raw.activity` result and its error handling. This applies when the platform
is inferred as well as when Android is specified explicitly. It covers all
screenshot and log flag combinations.

Keep sharing scoped to the resolved device and the current snapshot request.
Each new snapshot starts its own acquisition. Preserve the captured tree's
revision, timestamp, and evidence provenance. The tree and fingerprint share
a source observation. Other snapshot components can still describe different
instants within the request. Keep the public inputs and response shape, iOS
collection, standalone fingerprint and tree tools, and journey verification
paths as they are.

The existing tree acquisition owns its retries, deadlines, and child-process
cleanup. If it fails, report both the tree error and fingerprint unavailability
using the existing per-component error fields. A second tree collection solely
for the fingerprint would defeat the intended sharing. Preserve independent
screenshot, activity, and log results. Preserve the existing fingerprint
fallback when the post-tree activity query fails, and report a fingerprint
calculation failure without discarding a successful tree. Capture only
timing, counts, build identity, and sanitized failure categories in the paired
benchmark artifacts.

## Acceptance

1. A successful Android snapshot makes one logical tree acquisition. Verify
   that the returned fingerprint matches the existing algorithm applied to
   the returned tree and the post-tree activity. Verify repeated captures
   after a state change, device isolation, and unchanged response fields.
2. Verify tree failure, activity failure, timeout, and partial results without
   an extra fingerprint-driven tree acquisition. Retain the current native
   acquisition and its cleanup path. Verify the unchanged iOS dispatch path
   in unit coverage and report native iOS availability separately.
3. Run a focused paired comparison of screenshot/log-free snapshots on the same
   stable Android emulator and fixture screen. Use three warm-ups and ten
   measured attempts per build, alternate order, and retain failures and read
   attempts. Require fewer physical read attempts and a lower p95 with no
   p50 regression or additional tool failures. Record build and fixture hashes.
   The historical partial run motivates the candidate. The acceptance comparison
   uses a newly measured baseline and candidate under matching conditions.
4. Run `npm run verify`, applicable `npm run test:device` coverage, and a focused
   native snapshot check. Record blocked checks and withhold any speedup claim
   if the paired run is incomplete or correctness checks fail.
