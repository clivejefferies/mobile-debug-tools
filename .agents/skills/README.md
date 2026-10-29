# Skills

This repository stores agent skills as **plain Markdown packages** so they can be consumed by different agent systems, including Copilot, Codex, Claude, or custom internal agents.

## Portability rules

1. Keep the entrypoint in `skills/<skill-name>/SKILL.md`.
2. Use simple, readable sections instead of vendor-specific syntax or hidden metadata.
3. Keep `SKILL.md` short and task-oriented.
4. Put detailed guidance in `skills/<skill-name>/references/*.md`.
5. Describe behavior in terms of **inputs, outputs, workflow, and constraints**, not a specific product's tool API.
6. When a skill depends on repository conventions, link to the exact repo paths and commands the agent should inspect or run.

## Recommended SKILL.md structure

- Title
- `name`
- `version`
- `summary`
- Purpose
- Activation conditions
- Surface area (actions)
- Core guidance
- Inputs & outputs
- Failure handling
- Progressive disclosure
- References

## Repository-specific expectation

Skills in this repo should be:

- **generic enough** to be followed by different agents
- **specific enough** to encode this repository's working conventions
- **lightweight** so agents can load them quickly and fetch references only when needed
