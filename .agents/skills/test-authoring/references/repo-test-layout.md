# Repository test layout

Use this reference when deciding **where** a new test belongs.

## Automated unit tests

- Location: `test/unit/...`
- Naming: `*.test.ts`
- Execution: `npm run test:unit`
- Runner behavior: `test/unit/index.ts` discovers every `*.test.ts` file and runs each one in an isolated `tsx` subprocess

Best for:
- handler logic
- schema and contract defaults
- response-shape validation
- shared utility behavior
- deterministic edge cases

## Automated device smoke tests

- Location: `test/device/automated/...`
- Naming: usually `*.smoke.ts` or `*.integration.ts`
- Execution: `npm run test:device`
- Runner behavior: `test/device/index.ts` runs only the automated subtree

Best for:
- real Android/iOS tool wiring
- smoke-level confidence that a command works end-to-end
- checks that need real `adb`, `xcrun`, simulator, or device behavior

## Manual device helpers

- Location: `test/device/manual/...`
- Purpose: scripts that humans or agents can invoke directly for ad hoc validation
- Not part of the default automated test commands

Best for:
- workflows that require app-specific arguments
- environment-specific debugging
- high-friction scenarios not suitable for default CI-like execution

## Placement rules

1. If the behavior can be validated with mocks, fake binaries, or narrow test hooks, prefer `test/unit/...`.
2. If the behavior depends on real platform tooling, add an automated smoke test under `test/device/automated/...`.
3. If the behavior requires manual setup, project-specific app IDs, or ad hoc arguments, add a helper under `test/device/manual/...`.
4. Avoid leaving obsolete tests in the wrong tree; move or delete them so tree meaning stays clear.
