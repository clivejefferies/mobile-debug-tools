# Mobile Debug MCP agent plugin

Install this directory as an Agent Plugins package in a client that supports
both skills and stdio MCP servers. It provides the existing mobile-debug MCP
usage skill and launches the published `mobile-debug-mcp` npm package. The
plugin requires Node.js 18 or newer, `npx`, and the platform toolchains needed
for the devices you want to use. The first launch may need npm registry access.
The MCP process starts in the client-managed plugin data directory so npm does
not resolve the source checkout as a local package when installed from this repo.

The server is pinned to the published npm version in `mcp.json`. The plugin's
`plugin.json` version advances independently for guidance-only releases; do not
change the server pin to an unpublished npm version. The repository's
`skills/mobile-debug-tools-usage/SKILL.md` is the
source of the packaged skill; run `npm run sync:agent-plugin` after editing it.
That command also updates the Codex, Claude Code, and Cursor marketplace copies
under `plugins/mobile-debug-tools/`, `claude-plugin/`, and `cursor-plugin/`.
The packaged directory uses the skill's declared name, `mobile-debug-mcp`, as
required by Agent Skills. `npm run check:agent-plugin` checks the packaged
copies and configuration.

The usage skill prefers screenshots for routine visual checks and reserves
hierarchy reads for semantic selection and structured assertions. Assertion
timeouts must cover a fresh tree read as well as the expected app transition.

If you already configured the MCP server directly in your agent client, disable
that separate registration when enabling this plugin to avoid duplicate tools.
The direct npm installation remains available without this plugin. See the
repository README for platform toolchain setup and `get_system_status` guidance.
