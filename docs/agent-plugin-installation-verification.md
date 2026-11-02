# Agent plugin installation verification

Checked 2026-11-02 for plugin 0.0.5 and published MCP 0.35.0. This record separates
command/schema checks from installation and live device evidence.

| Client | Evidence | Limit |
| --- | --- | --- |
| Codex CLI 0.166.0-alpha.5.1 | Marketplace-add and plugin-add syntax confirmed with installed CLI help and official docs; catalog paths checked by repository verification | No new Codex installation or agent journey performed |
| Claude Code 2.1.285 | Native strict validation passes for the marketplace, compatibility manifest and complete plugin folder; shell command syntax confirmed | No new Claude Code installation or agent journey performed |
| Cursor | Native package and catalog generated from the canonical skill; uses documented CURSOR_PLUGIN_ROOT; local-copy instructions preserve hidden files | Host loading in Cursor is unrun |
| Antigravity CLI 1.4.12 | Standalone export passes strict validation with zero warnings; local install discovers one skill and one MCP server | An agent print-mode attempt was denied by plan-mode MCP policy; a narrowly permitted read-only attempt timed out, so no agent tool-call success is claimed |

The Antigravity export contains native `plugin.json`, `mcp_config.json`, README,
license, logo and the shared skill. It excludes foreign client manifests and
Finder metadata. Export destinations must be new directories. Regression coverage
checks inventory, canonical skill/license bytes and refusal to overwrite existing
files. Cursor's generated skill/license are checked against their canonical
sources by `npm run check:agent-plugin`.

A separate SDK test launched the exact exported npx command from an expanded
PLUGIN_DATA working directory. It connected to published MCP 0.35.0, discovered
52 tools, selected emulator-5554 (Android 16/API 36), launched Settings and asserted
a fresh UI tree contained a visible Settings-owned resource. **PASS**; this is an
exported-config/device check, not an Antigravity agent interaction. Log:
`/tmp/antigravity-published-mcp-check.log`. The emulator remains running.

`npm run verify` **PASS**, all 91 unit files, including the exporter regression,
lint/quality/architecture, build and plugin consistency. Native Antigravity strict
validation and Claude strict validation also **PASS**. Markdown links and diff
whitespace were checked. No production server code or dependencies changed.
GitHub/local distribution does not require the optional Marketplace intake form;
no application was submitted.

## Primary documentation

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Claude Code installation](https://code.claude.com/docs/en/discover-plugins)
- [Cursor plugins and local testing](https://cursor.com/docs/plugins)
- [Antigravity plugin building and validation](https://antigravity.google/docs/build-plugins)
