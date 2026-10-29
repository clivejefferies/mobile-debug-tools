# Test quality checklist

A new test in this repo is high quality when it does most of the following:

## Contract quality

- proves the right behavior, not just that code executed
- asserts on meaningful fields rather than only truthy values
- protects documented defaults where drift would matter
- covers at least one failure path when the behavior can fail

## Determinism

- does not depend on arbitrary timing unless the behavior is inherently time-based
- restores mocks, env vars, and monkeypatches in `finally`
- avoids leaking state into later tests
- runs reliably in an isolated subprocess

## Placement quality

- lives in the correct tree (`test/unit`, `test/device/automated`, or `test/device/manual`)
- uses file naming consistent with the surrounding tests
- does not leave obsolete duplicate coverage in a different tree

## Maintainability

- reuses existing helpers, fake-binary patterns, or test seams
- keeps fixtures as small as possible
- makes the failure obvious from the assertion message or output
- stays focused on one behavior cluster instead of becoming a broad scenario script

## Completion bar

Before considering the work done, the author should be able to say:

1. The test is in the correct place.
2. The test matches the current repo style.
3. The test would fail if the protected behavior regressed.
4. The normal repository validation commands still pass.
