# Test authoring workflow

Use this workflow when adding or updating tests in this repository.

## 1. Identify the behavior boundary

Classify the change:

- pure utility or parser logic
- handler / response contract logic
- server registration or schema wiring
- real platform integration

This usually determines the cheapest useful test type.

## 2. Inspect nearby examples

Before writing a new test, inspect tests already covering the same area:

- `test/unit/server/...` for tool registration and response-shape tests
- `test/unit/interact/...` for handler tests and UI wait behavior
- `test/unit/manage/...` for build/install flows and fake toolchain binaries
- `test/unit/observe/...` for observe response contracts
- `test/unit/utils/...` for shared helper coverage
- `test/device/automated/...` for smoke test wrappers
- `test/device/manual/...` for JSON-producing helper scripts used by smoke tests

## 3. Match the existing style

For automated tests in this repo:

- use a self-running script
- use `assert` or explicit checks
- print a small success message
- `process.exit(1)` on failure

For unit tests that need isolation:

- patch only what is required
- restore original values in `finally`
- prefer injected seams or fake binaries over broad module mutation

## 4. Prefer existing seams

Before adding a new hook, search for:

- existing test-only setters/resetters
- environment-variable based indirection
- fake executable patterns already used in system/manage tests

Only add a new seam when the current code cannot be tested safely otherwise.

## 5. Protect the contract, not just the happy path

When testing tools or handlers, cover:

- expected success shape
- required fields
- key defaults
- at least one failure or invalid-input path

## 6. Validate with repo commands

Use only the existing validation entrypoints:

- `npm run build`
- `npm run lint`
- `npm run test:unit`
- `SKIP_DEVICE_TESTS=1 npm run test:device` for automated device wrappers when real devices are not part of the current validation run

## 7. Update docs only when structure or expectations changed

If the test layout, naming, or default commands change, update repo docs. If you only add another test following existing rules, docs may not need changes.
