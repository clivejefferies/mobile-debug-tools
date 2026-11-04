# Mobile Debug MCP agent plugin

[Documentation](../docs/README.md) · [Client installation](../README.md#agent-plugin)

Use the [client installation instructions](../README.md#agent-plugin) to install
the plugin. It supports clients with
both skills and stdio MCP servers: Codex, Claude Code, Cursor and Antigravity. It provides the mobile-debug MCP
usage skill and launches the published `mobile-debug-mcp` npm package. The
plugin requires Node.js 22 or newer, `npx`, and the platform toolchains needed
for the devices you want to use. The first launch may need npm registry access.
Codex and Antigravity run the MCP process in a client-managed plugin data
directory. Cursor uses its plugin root through `${CURSOR_PLUGIN_ROOT}`; Claude
Code chooses its own process working directory.

## Versions and maintenance

The server is pinned to the published npm version in `mcp.json`. The plugin's
`plugin.json` version advances independently for guidance-only releases; do not
change the server pin to an unpublished npm version. The
[usage skill](skills/mobile-debug-mcp/SKILL.md) is the canonical source shared by all four clients. Run
`npm run sync:agent-plugin` after updating the plugin metadata or server pin to
refresh all client manifests and the generated Cursor-native package in `cursor/`.
The Codex and Claude catalogs point to this portable directory; the Cursor
catalog points to `cursor/` because Cursor cannot expand `${PLUGIN_DATA}`.
The packaged directory uses the skill's declared name, `mobile-debug-mcp`, as
required by Agent Skills. `npm run check:agent-plugin` checks the packaged
copies and configuration.

## Using the plugin

After installation, the [usage skill](skills/mobile-debug-mcp/SKILL.md) guides the
agent through device selection, observation, interaction and verification.

The usage skill prefers screenshots for routine visual checks and reserves
hierarchy reads for semantic selection and structured assertions. Assertion
timeouts must cover a fresh tree read as well as the expected app transition.
It also covers optional Android and supported iOS simulator runtime debugging: capability checks, explicit
process attach, source stops, bounded inspection, stepping and owned cleanup.
Debugger guidance applies only when the connected server exposes those tools;
updating the skill does not update the pinned server or installed plugin.

If you already configured the MCP server directly in your agent client, disable
that separate registration when enabling this plugin to avoid duplicate tools.
The direct npm installation remains available without this plugin. See the
[repository requirements](../README.md#requirements) for platform toolchain setup and `get_system_status` guidance.

## Antigravity distribution

Run `npm run package:antigravity -- /absolute/path/to/a-new-directory` from the
repository root. The exporter uses only Node built-ins; it does not require a
local dependency install. It creates a standalone directory with native
`plugin.json`, `mcp_config.json`, README, license, logo and the canonical skill.
Validate that export with `agy plugin validate --strict /absolute/path/to/export`
and install it with `agy plugin install /absolute/path/to/export`.

The multi-client source intentionally contains files that Antigravity ignores;
strict validation belongs on the clean export, not on this mixed source folder.
Other clients' manifests are excluded from the export. The export is suitable
for a GitHub download or local installation without curated Marketplace approval.
Antigravity's Marketplace form is an optional, separate distribution route.

## Installation verification

The main README links each vendor's current installation documentation. Codex
and Claude Code's shell command syntax was checked against installed CLI help;
Claude's plugin and catalog validate with its native validator. Cursor's native
layout follows its documented local-plugin and variable rules; installation in
Cursor has not been exercised on this machine. Antigravity strict validation and
local component discovery have been exercised. Agent-level MCP permissions must
still be approved by the user; component discovery is not a completed tool call.
See the [installation verification record](../docs/agent-plugin-installation-verification.md)
for tested versions, device evidence and unrun host checks.
