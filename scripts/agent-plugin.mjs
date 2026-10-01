import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const packagedSkill = path.join(repositoryRoot, 'agent-plugin/skills/mobile-debug-mcp/SKILL.md')
const sourceSkill = path.join(repositoryRoot, 'skills/mobile-debug-tools-usage/SKILL.md')
const packagedLicense = path.join(repositoryRoot, 'agent-plugin/LICENSE')
const sourceLicense = path.join(repositoryRoot, 'LICENSE')
const packageInfo = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
const plugin = JSON.parse(readFileSync(path.join(repositoryRoot, 'agent-plugin/plugin.json'), 'utf8'))
const mcp = JSON.parse(readFileSync(path.join(repositoryRoot, 'agent-plugin/mcp.json'), 'utf8'))
const marketplacePluginRoot = path.join(repositoryRoot, 'plugins/mobile-debug-tools')
const marketplaceManifestPath = path.join(marketplacePluginRoot, '.codex-plugin/plugin.json')
const marketplaceMcpPath = path.join(marketplacePluginRoot, '.mcp.json')
const marketplaceSkillPath = path.join(marketplacePluginRoot, 'skills/mobile-debug-mcp/SKILL.md')
const marketplaceLicensePath = path.join(marketplacePluginRoot, 'LICENSE')
const claudePluginRoot = path.join(repositoryRoot, 'claude-plugin')
const claudeManifestPath = path.join(claudePluginRoot, '.claude-plugin/plugin.json')
const claudeMcpPath = path.join(claudePluginRoot, '.mcp.json')
const cursorPluginRoot = path.join(repositoryRoot, 'cursor-plugin')
const cursorManifestPath = path.join(cursorPluginRoot, '.cursor-plugin/plugin.json')
const cursorMcpPath = path.join(cursorPluginRoot, 'mcp.json')
const { $schema: _pluginSchema, extensions, ...pluginMetadata } = plugin
const expectedMarketplaceManifest = {
  ...pluginMetadata,
  skills: './skills/',
  mcpServers: './.mcp.json',
  interface: extensions['com.openai'].interface,
}
const { $schema: _mcpSchema, ...marketplaceMcp } = mcp
const expectedClaudeManifest = Object.fromEntries(
  ['name', 'version', 'description', 'author', 'repository', 'license'].map(key => [key, plugin[key]]),
)
const expectedClaudeMcp = {
  mcpServers: {
    [packageInfo.name]: {
      command: 'npx',
      args: ['--yes', `${packageInfo.name}@${packageInfo.version}`, 'server'],
    },
  },
}
const expectedCursorManifest = {
  ...expectedClaudeManifest,
  skills: './skills/',
  mcpServers: './mcp.json',
}
const expectedCursorMcp = {
  mcpServers: {
    [packageInfo.name]: {
      ...expectedClaudeMcp.mcpServers[packageInfo.name],
      cwd: '${CURSOR_PLUGIN_ROOT}',
    },
  },
}

if (process.argv[2] === '--sync') {
  copyFileSync(sourceSkill, packagedSkill)
  copyFileSync(sourceLicense, packagedLicense)
  mkdirSync(path.dirname(marketplaceManifestPath), { recursive: true })
  mkdirSync(path.dirname(marketplaceSkillPath), { recursive: true })
  writeFileSync(marketplaceManifestPath, `${JSON.stringify(expectedMarketplaceManifest, null, 2)}\n`)
  writeFileSync(marketplaceMcpPath, `${JSON.stringify(marketplaceMcp, null, 2)}\n`)
  copyFileSync(sourceSkill, marketplaceSkillPath)
  copyFileSync(sourceLicense, marketplaceLicensePath)
  mkdirSync(path.dirname(claudeManifestPath), { recursive: true })
  mkdirSync(path.join(claudePluginRoot, 'skills/mobile-debug-mcp'), { recursive: true })
  mkdirSync(path.dirname(cursorManifestPath), { recursive: true })
  mkdirSync(path.join(cursorPluginRoot, 'skills/mobile-debug-mcp'), { recursive: true })
  writeFileSync(claudeManifestPath, `${JSON.stringify(expectedClaudeManifest, null, 2)}\n`)
  writeFileSync(claudeMcpPath, `${JSON.stringify(expectedClaudeMcp, null, 2)}\n`)
  writeFileSync(cursorManifestPath, `${JSON.stringify(expectedCursorManifest, null, 2)}\n`)
  writeFileSync(cursorMcpPath, `${JSON.stringify(expectedCursorMcp, null, 2)}\n`)
  copyFileSync(sourceSkill, path.join(claudePluginRoot, 'skills/mobile-debug-mcp/SKILL.md'))
  copyFileSync(sourceLicense, path.join(claudePluginRoot, 'LICENSE'))
  copyFileSync(sourceSkill, path.join(cursorPluginRoot, 'skills/mobile-debug-mcp/SKILL.md'))
  copyFileSync(sourceLicense, path.join(cursorPluginRoot, 'LICENSE'))
}
else if (process.argv[2] !== '--check') throw new Error('Use --sync or --check')

assert.equal(plugin.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
assert.equal(plugin.name, 'mobile-debug-tools')
assert.match(plugin.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'plugin releases use an independent semantic version')
assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
const servers = Object.entries(mcp.mcpServers)
assert.equal(servers.length, 1, 'the plugin should expose only this MCP server')
const [serverName, server] = servers[0]
assert.equal(serverName, packageInfo.name)
assert.equal(server.type, 'stdio')
assert.equal(server.command, 'npx')
assert.deepEqual(server.args, ['--yes', `${packageInfo.name}@${packageInfo.version}`, 'server'])
assert.equal(server.cwd, '${PLUGIN_DATA}', 'npx must run outside the same-named source checkout')
assert.deepEqual(readFileSync(packagedSkill), readFileSync(sourceSkill), 'packaged usage skill must match its source')
assert.deepEqual(readFileSync(packagedLicense), readFileSync(sourceLicense), 'packaged license must match its source')
assert.deepEqual(JSON.parse(readFileSync(marketplaceManifestPath, 'utf8')), expectedMarketplaceManifest, 'Codex marketplace manifest must match the portable plugin')
assert.deepEqual(JSON.parse(readFileSync(marketplaceMcpPath, 'utf8')), marketplaceMcp, 'Codex marketplace MCP configuration must match the portable plugin')
assert.deepEqual(readFileSync(marketplaceSkillPath), readFileSync(sourceSkill), 'Codex marketplace skill must match its source')
assert.deepEqual(readFileSync(marketplaceLicensePath), readFileSync(sourceLicense), 'Codex marketplace license must match its source')
assert.deepEqual(JSON.parse(readFileSync(claudeManifestPath, 'utf8')), expectedClaudeManifest, 'Claude plugin manifest must match the portable plugin')
assert.deepEqual(JSON.parse(readFileSync(claudeMcpPath, 'utf8')), expectedClaudeMcp, 'Claude MCP configuration must match the published server')
assert.deepEqual(JSON.parse(readFileSync(cursorManifestPath, 'utf8')), expectedCursorManifest, 'Cursor plugin manifest must match the portable plugin')
assert.deepEqual(JSON.parse(readFileSync(cursorMcpPath, 'utf8')), expectedCursorMcp, 'Cursor MCP configuration must match the published server')
assert.deepEqual(readFileSync(path.join(claudePluginRoot, 'skills/mobile-debug-mcp/SKILL.md')), readFileSync(sourceSkill), 'Claude skill must match its source')
assert.deepEqual(readFileSync(path.join(claudePluginRoot, 'LICENSE')), readFileSync(sourceLicense), 'Claude license must match its source')
assert.deepEqual(readFileSync(path.join(cursorPluginRoot, 'skills/mobile-debug-mcp/SKILL.md')), readFileSync(sourceSkill), 'Cursor skill must match its source')
assert.deepEqual(readFileSync(path.join(cursorPluginRoot, 'LICENSE')), readFileSync(sourceLicense), 'Cursor license must match its source')
for (const [marketplacePath, source] of [
  ['.agents/plugins/marketplace.json', './plugins/mobile-debug-tools'],
  ['.claude-plugin/marketplace.json', './claude-plugin'],
  ['.cursor-plugin/marketplace.json', './cursor-plugin'],
]) {
  const marketplace = JSON.parse(readFileSync(path.join(repositoryRoot, marketplacePath), 'utf8'))
  assert.equal(marketplace.name, plugin.name, `${marketplacePath} name must match the plugin`)
  assert.equal(marketplace.plugins.length, 1, `${marketplacePath} must expose one plugin`)
  assert.equal(marketplace.plugins[0].name, plugin.name, `${marketplacePath} plugin name must match`)
  assert.equal(marketplace.plugins[0].source?.path ?? marketplace.plugins[0].source, source, `${marketplacePath} source must point to the packaged copy`)
}
const skillName = readFileSync(packagedSkill, 'utf8').match(/^---\r?\nname: ([a-z0-9-]+)\r?\n/)?.[1]
assert.equal(skillName, path.basename(path.dirname(packagedSkill)), 'packaged skill directory must match its frontmatter name')

console.log('Agent plugin package is in sync')
