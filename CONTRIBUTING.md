# Contributing

Read the [development process](docs/specs/process.md) before planning, editing,
or reviewing a change. Documentation and maintenance use its lightweight path;
new capabilities and material contract changes require intent and specification
approval. Automated contributors also start with [AGENTS.md](AGENTS.md).

## Local development

Use Node.js 18 or newer and npm. Platform tooling is needed only for the mobile
operations you exercise; see [requirements and setup](README.md#requirements).

```sh
npm ci
npm run build
npm start
```

The TypeScript entrypoint is [src/server.ts](src/server.ts); registration and
dispatch live in [src/server-core.ts](src/server-core.ts) and [src/server/](src/server/).
The optional Java debugger bridge lives in
[src/debugger/java/](src/debugger/java/). It is shipped as source and compiled
on demand by the debugger; the TypeScript build does not compile Java.

Platform operations are grouped under `src/manage/`, `src/interact/`,
`src/observe/`, `src/debugger/`, and `src/system/`, with shared helpers in `src/utils/`.

## Validation

```sh
npm run verify
npm run test:device
```

`verify` runs lint, the TypeScript build, automated unit tests, and plugin
consistency checks. Run applicable device checks for native or runtime changes;
record which devices and behaviours actually ran. See the [process verification
requirements](docs/specs/process.md#5-verify-and-report) for reporting failures,
blocked checks, and unrun coverage. Documentation-only work needs diff, relative
link/path, command, and consistency checks; builds and device tests are unnecessary.

Load the [test-authoring skill](.agents/skills/test-authoring/SKILL.md) before
changing tests, and the [MCP builder skill](.agents/skills/mcp-builder/SKILL.md)
for installation or native toolchain work. Automated unit tests belong in
`test/unit/`, automated device tests in `test/device/automated/`, and manual
helpers in `test/device/manual/`.

## Code structure

Follow the [code structure and quality checks](docs/code-structure.md) for module
ownership, enforced limits, and review of legacy exceptions. `npm run lint`
includes the structural gate; CI runs the same checks.

## Documentation conventions

Use the [documentation index](docs/README.md) to place new material. Keep one
page responsible for each contract and link to it from related guides. Keep
setup in the root README, current tool contracts in `docs/tools/`, design records
in `docs/specs/`, and measurements in `docs/benchmarks/`.

Write guides around a reader's task: explain when to use the page, show a complete
example where useful, and link to the likely next step. Keep walkthroughs in
[Getting started](README.md#getting-started) and detailed contracts in the tool
reference. Avoid duplicating the full navigation on every page; long references
should offer task-based links to their own sections.

Use one descriptive level-one heading per document and a logical heading
hierarchy. Use relative links for repository files. Explain prerequisites before
commands and distinguish examples, proposals, and verified behaviour. Keep
historical approval and verification evidence dated; avoid chat-relative wording,
agent handoff instructions, transient checkout status, and temporary log paths.
Do not turn an earlier design decision into a current support or release claim.

When usage changes, update the relevant tool reference, README, and changelog.
When plugin metadata or its server pin changes, run `npm run sync:agent-plugin`
and `npm run check:agent-plugin`; see the [plugin guide](agent-plugin/README.md).
