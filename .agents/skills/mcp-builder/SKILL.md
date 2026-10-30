# MCP Builder skill

name: mcp-builder
version: 0.1.1
summary: Build, install and diagnose Android/iOS tooling using this repository’s existing adapters and validation commands.

## Purpose

Use this skill for native builds, installations, toolchain diagnosis and verification
of `mobile-debug-mcp`. Follow the [shared development process](../../../docs/specs/process.md)
for scope, approvals and reporting.

## Workflow

1. Inspect the relevant adapter under `src/manage/` and platform helpers under
   `src/utils/`. Reuse their subprocess, timeout and diagnostic handling.
2. Check only the tools needed by the task. Use the
   [toolchain reference](references/toolchain-details.md) for Java/JBR, adb, idb
   and Xcode discovery; confirm environment settings in the owning source.
3. For Gradle builds, reuse `prepareGradle()` from `src/utils/android/utils.ts`.
   For iOS builds, follow `src/manage/ios.ts`. Consult
   [build configuration](references/build-flags.md) for supported overrides.
4. Preserve installation fallbacks and error contracts. Collect command, output,
   exit status and relevant environment details on failure; redact secrets.
   The [diagnostic report format](references/diagnostics-schema.md) is guidance
   for investigations, not a replacement for a tool’s public response shape.
5. Run `npm run verify` for code changes. Lint includes the
   [structural and architecture gates](../../../docs/code-structure.md); use
   `npm run check:quality` and `npm run check:architecture` to diagnose failures.
6. For native/runtime changes, run applicable device checks and report the actual
   device, server build, observed result and cleanup. A skipped device suite or
   successful build does not prove device behaviour. The
   [isolated Android fixture](../../../test/fixtures/debugger-app/README.md) covers
   interactions, labelled-control convergence and debugger journeys.

## Test placement

Follow the [test-authoring skill](../test-authoring/SKILL.md) when changing tests.
Fake-toolchain tests belong under `test/unit/manage/`, `test/unit/system/` or
`test/unit/utils/` according to the owning module. Automated native checks belong
under `test/device/automated/`; ad hoc helpers belong under `test/device/manual/`.

## References

- [Toolchain details](references/toolchain-details.md): discovery and Java selection.
- [Build configuration](references/build-flags.md): existing build flags and overrides.
- [Diagnostics](references/diagnostics-schema.md): reporting command failures.
