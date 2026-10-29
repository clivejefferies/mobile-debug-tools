# Development process

This is the required development workflow for all agents contributing to
`mobile-debug-mcp`. Read it before planning, editing, or reviewing changes,
including work delegated to another agent. [AGENTS.md](../../AGENTS.md) is the
shared entrypoint; tool-specific instructions must point here rather than
maintain a competing workflow. Explicit user instructions take precedence.

The agent owns investigation, implementation, and verification. The user or
explicitly designated maintainer owns product decisions and approval. Existing
explicit approval in the current conversation counts for unchanged scope; do
not ask for it again. Never invent approval or treat silence as approval.

## Choose the path

Use the full process for new MCP capabilities, material tool behaviour or
contract changes, and significant architecture changes. Use the lightweight
path for fixes restoring agreed behaviour, refactors that preserve contracts,
small maintenance changes, and documentation-only work. Move to the full path
if investigation exposes new behaviour or unresolved product decisions.

For the lightweight path:

1. State the intended outcome and scope in the conversation.
2. Inspect the relevant code, contracts, tests, and instructions.
3. Make focused changes and run applicable verification below.
4. Report the changes, evidence, and remaining limitations.

Separate intent, spec, and plan files and approval stages are not required for
the lightweight path. Documentation-only changes require a diff, link/path,
and consistency check; application builds and device tests are unnecessary.

For the full path, keep `intent.md`, `spec.md`, and `plan.md` together under
`docs/specs/<next-number>-<feature>/`, following existing directory naming.
Reuse the relevant feature directory where appropriate. Do not rewrite old
specs retrospectively; add only what is needed for the current scope.

## Keep artifacts concise

Use these writing defaults for the full path:

- `intent.md`: about 200 words covering the problem, outcome, scope, and open
  questions, with the required source and status information.
- `spec.md`: about 800 words focused on behaviour, contracts, failure handling,
  acceptance criteria, and decisions needing approval.
- `plan.md`: a short implementation checklist and verification table. Append
  actual results as work finishes.

These are defaults, not limits. Add detail when complexity or risk requires it;
retain all applicable stage requirements and approval gates below. Record each
decision once and reference it from later documents instead of repeating it.
Use examples only where a contract would otherwise be ambiguous. Link detailed
logs and evidence rather than copying them, while keeping enough result detail
in the plan to assess coverage and any remaining failures or blockers.

## 1. Capture intent

Write `intent.md` with:

- The original problem and its source, preserving the originator's meaning.
- Desired outcome, affected MCP clients, platforms, and observable success criteria.
- Constraints, exclusions, assumptions, and open questions.
- Originator, date, and status; do not invent identities.

Show the captured intent and obtain explicit agreement before drafting the
spec. A clarification about one detail does not approve the complete intent.
Record the approving response and its scope. While approval is pending,
continue only investigation or independent work that does not assume it.

**Exit:** the user has accepted the problem and scope, and questions blocking
specification are answered.

## 2. Investigate and specify

Inspect the current checkout and preserve unrelated changes. Ground the design
in existing code, tests, and [tool contracts](../tools/TOOLS.md). Reuse helpers
and conventions rather than introducing new frameworks without a concrete need.

Load applicable repository skills from [.agents/skills/](../../.agents/skills/README.md):

- [Test authoring](../../.agents/skills/test-authoring/SKILL.md) before creating or updating tests.
- [MCP builder](../../.agents/skills/mcp-builder/SKILL.md) for build, installation, or native toolchain work.
- [Spec review](../../.agents/skills/spec-review/SKILL.md) when reviewing an RFC or spec draft.

For device-dependent behaviour, inspect the current tool flow on an available
device or emulator when practical. Record the platform, device, server build,
observed behaviour, and inaccessible states. If unavailable, record the concrete
blocker and available code/test evidence; plan a runnable device check.

Write `spec.md` defining:

- Required behaviour and plain-language acceptance criteria linked to the intent.
- Scope, exclusions, failure, recovery, cancellation, and timeout behaviour.
- MCP tool names, input schemas, response/error shapes, and compatibility impact.
- Android/iOS differences and unsupported environments where applicable.
- Device/process targeting, resource ownership and cleanup, concurrency, and
  subprocess handling where relevant.
- Security and privacy implications, including arguments, logs, screenshots,
  UI trees, credentials, and potentially destructive device actions.
- Affected modules, risks, assumptions, and unresolved decisions.
- Approval status and a reference to the actual approving decision.

Show the complete spec and obtain explicit acceptance before planning
implementation. An instruction to implement an already accepted spec authorises
that scope.

**Exit:** the spec is accepted and decisions blocking correctness or scope are resolved.

## 3. Plan implementation and verification

Save `plan.md` with:

- References to intent, spec, and approval decisions.
- Affected files/modules and an ordered implementation checklist.
- Dependencies, risks, compatibility, rollout, and cleanup steps as applicable.
- Each acceptance criterion mapped to a meaningful automated or device check.
- Exact verification commands and required runtime/toolchain versions.
- For device checks: platform/device, starting state, actions, expected result,
  evidence to capture, fixture requirements, and cleanup.
- Unavailable prerequisites, their owner where known, and how to obtain them or
  perform an equivalent check.

Use the existing lightweight self-running `tsx` test pattern. No separate
scenario language, scenario-approval stage, or new test framework is required.
Routine technical planning choices do not need separate approval.

Check scarce prerequisites early. Treat missing access as a planning blocker
only when an essential acceptance criterion has no credible verification route.
Do not describe readiness checks as verification of unimplemented behaviour.

**Exit:** implementation is authorised within the accepted spec, the plan has
no unresolved blocking dependency, and essential criteria have credible checks.

## 4. Implement and handle discoveries

Implement the agreed scope, add meaningful regression coverage where needed,
and update the plan as work completes. Place tests according to the test-authoring
skill: automated unit tests in `test/unit/`, automated device checks in
`test/device/automated/`, and manual/debug helpers in `test/device/manual/`.

Review changed code, tests, and relevant callers for contract consistency,
platform differences, error handling, subprocess safety, resource cleanup,
state ownership, and reliable assertions. Review depth should match the risk.

When new evidence changes the work:

- Update the plan for routine implementation choices.
- Update the spec for design or contract changes. Obtain agreement before
  implementing material changes to behaviour, scope, permissions, data handling,
  compatibility, or acceptance criteria.
- Update intent only if the problem or intended outcome changes; preserve the
  original statement and record the accepted revision.
- Record blockers and continue independent work. Do not silently weaken requirements.

Keep [tool documentation](../tools/TOOLS.md), [README](../../README.md), and
[changelog](../CHANGELOG.md) aligned when usage or behaviour changes.

**Exit:** agreed implementation and relevant documentation are ready for verification.

## 5. Verify and report

For code or test changes, run focused checks during iteration and complete the
maintainer verification command from the repository root:

```sh
npm run verify
```

This currently runs lint, TypeScript build, all automated unit tests, and the
agent-plugin consistency check. Confirm scripts in [package.json](../../package.json)
and applicable [CI workflows](../../.github/workflows) in the current checkout;
report any difference between local validation and CI coverage.

For changes affecting native device interaction, platform tooling, or runtime
behaviour, also run applicable automated device checks:

```sh
npm run test:device
```

Confirm which platforms and behaviours the suite actually covers. Supplement
it with focused end-to-end tool calls on the updated server where required by
the acceptance criteria. A passing Android check does not establish iOS support;
a dispatched action or mocked subprocess does not prove a real device outcome.

For each relevant device journey, record the platform/device and server build,
starting state, actions/tool calls, expected and observed result, evidence, and
**pass**, **fail**, **blocked**, or **unrun** status. Include failure, recovery,
interruption, and cleanup paths where relevant. Restore device settings and
remove temporary test data after verification. If a platform or prerequisite is
unavailable, state the concrete blocker and next step rather than claiming full
verification.

For schema changes, check registration, dispatch, runtime validation, response
serialization, documentation, and callers/fixtures together. Distinguish local
compatibility checks from testing an installed or published package.

Investigate failures against the agreed contract. Do not weaken assertions,
skip tests, add suppressions, or lower validation rules merely to get a pass.
Distinguish pre-existing failures from regressions with evidence; neither is a
pass. Fix issues introduced by the change and report unrelated findings separately.

For documentation-only work, inspect the diff, validate changed relative links
and referenced paths/commands, and check consistency across agent entrypoints.
Required pull-request CI checks still apply.

**Exit:** all agreed work and applicable checks have passed. Otherwise, report
partial completion and identify failed, blocked, or unrun checks explicitly.

The final report states what changed, verification commands and outcomes,
relevant device evidence, focused review findings, and remaining limitations.
Summarise successful output rather than pasting full logs. Commit, push, publish,
and release only within the user's authorised workflow.
