# AGENTS.md

This file is the **cold-start entrypoint for autonomous agents** that arrive in this public repository without prior context.

It is intentionally vendor-neutral and should be useful to Copilot, Codex, Claude, or custom agent systems.

## What this repository is

`mobile-debug-mcp` is an MCP server for mobile app debugging on Android and iOS. The codebase is TypeScript and the built server entrypoint is `dist/server.js`.

Primary areas:

- `src/server.ts` — runtime entrypoint
- `src/server-core.ts` — tool registration and dispatch logic
- `src/interact/` — tap, swipe, typing, waits, and interaction helpers
- `src/observe/` — logs, screenshots, UI tree, fingerprints, snapshots
- `src/manage/` — build, install, start, terminate, restart, reset-app-data
- `src/system/` — environment and toolchain health checks
- `src/utils/` — shared helpers and platform-specific utility code

## First things an agent should know

1. Prefer existing helpers and conventions over introducing new frameworks or abstractions.
2. The repository already has a test structure; place tests in the correct tree instead of inventing new ones.
3. Use existing validation commands:
   - `npm run build`
   - `npm run lint`
   - `npm run test:unit`
   - `npm run test:device`
4. Device tests are split intentionally:
   - `test/device/automated/...` = automated smoke/integration coverage
   - `test/device/manual/...` = helper/debug/manual scripts
5. Unit tests use the current lightweight self-running `tsx` pattern rather than a dedicated framework.

## Where to look for deeper guidance

### Skills

Portable agent skills live under `skills/`.

- `skills/README.md` — repo-wide skill convention
- `skills/mcp-builder/` — build/install/toolchain guidance
- `skills/test-authoring/` — test creation and placement guidance
- `skills/rfc-review/` — RFC review rubric and response template

If the task is about **creating or updating tests**, load `skills/test-authoring/SKILL.md` first.

If the task is about **building, installing, or diagnosing native tooling**, load `skills/mcp-builder/SKILL.md` first.

If the task is about **reviewing an RFC or spec draft**, load `skills/rfc-review/SKILL.md` first.

### Repository docs

- `README.md` — high-level repo overview and commands
- `docs/tools/TOOLS.md` — tool documentation and contracts
- `docs/CHANGELOG.md` — recent behavioral changes

## Testing guidance

Use these defaults unless the task clearly requires something else:

- Add automated unit tests under `test/unit/...`
- Add automated device smoke tests under `test/device/automated/...`
- Add ad hoc or environment-specific helper scripts under `test/device/manual/...`

For test authoring details, rely on the `test-authoring` skill package rather than duplicating its rules here.

## Output expectations for agents

- Make focused changes
- Preserve existing repo behavior unless the task requires a change
- Keep docs aligned when structure or usage changes
- Prefer deterministic validation over ad hoc verification

## Notes for maintainers

This file is intentionally short. Keep task-specific guidance in `skills/...` so multiple agent systems can reuse the same instructions.
