# Test Authoring skill

name: test-authoring
version: 0.1.0
summary: Reusable guidance for adding or updating tests in this repository without tying the workflow to a single agent product.

# Purpose
Help an agent create, extend, or reorganize tests while following this repository's current conventions for unit tests, automated device smoke tests, and manual device helpers.

# Activation conditions
Activate when an agent needs to:
- add a new test for existing code
- update tests after changing tool behavior or response contracts
- move tests into the correct unit, automated device, or manual device location
- improve coverage for handlers, server contracts, or shared utilities

# Surface area (actions)
- choose-test-type
- place-test-file
- mirror-existing-pattern
- add-or-update-fixtures
- validate-test-command
- document-test-scope

# Core guidance
1. Prefer the **smallest reliable test type**: unit test first, automated device smoke test only when real platform integration matters, manual helper only when automation is not practical.
2. Follow the repository's current automated test style: self-running `tsx` scripts with explicit assertions and non-zero exit on failure.
3. Put automated unit tests under `test/unit/...`; the unit runner automatically executes every `*.test.ts` file there.
4. Put automated device smoke tests under `test/device/automated/...`; put human-invoked helpers under `test/device/manual/...`.
5. Reuse existing mocking seams and test hooks before creating new ones.
6. When testing user-facing tools, protect **response shape**, required fields, and documented defaults.
7. Keep tests deterministic: isolate process-global mocks, prefer fake binaries or injected helpers over shared mutable module state.
8. Validate with the repository commands that already exist instead of inventing new runners.

# Inputs & outputs
- choose-test-type(input: { changedPaths[], behaviorType, requiresRealDevice?: boolean }) -> { recommendedType: 'unit'|'device-automated'|'device-manual', rationale, targetPath }
- place-test-file(input: { featureArea, recommendedType }) -> { filePath, namingPattern, runner }
- mirror-existing-pattern(input: { targetPath }) -> { referenceFiles[], patternSummary }
- validate-test-command(input: { scope: 'unit'|'device'|'repo' }) -> { commands[] }
- document-test-scope(input: { testPath, purpose }) -> { docsToUpdate[] }

# Failure handling
- If the correct test type is ambiguous, prefer unit coverage unless the behavior depends on real device/simulator integration.
- If a test requires brittle global monkeypatching, isolate it in a subprocess-friendly way or add a narrow injection seam.
- If device automation is too environment-dependent, keep the helper under `test/device/manual/...` and add a smaller automated smoke test around a stable contract.

# Progressive disclosure
- Keep this file short.
- Load detailed references only when deciding placement, matching existing style, or validating new tests.

# References
- `references/repo-test-layout.md` — where tests belong and what each tree means
- `references/test-authoring-workflow.md` — step-by-step workflow for creating or changing tests
- `references/test-quality-checklist.md` — what a good test in this repo should prove before it is considered done

# License
Same as repository (Apache-2.0).
