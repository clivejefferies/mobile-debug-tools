import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const pluginRoot = path.join(repositoryRoot, 'agent-plugin')
const packagedSkill = path.join(pluginRoot, 'skills/mobile-debug-mcp/SKILL.md')
const packagedLicense = path.join(pluginRoot, 'LICENSE')
const sourceLicense = path.join(repositoryRoot, 'LICENSE')
const packageInfo = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
const plugin = JSON.parse(readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'))
const mcp = JSON.parse(readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'))
const { $schema: _pluginSchema, extensions, ...pluginMetadata } = plugin
const { $schema: _mcpSchema, ...codexMcp } = mcp
const codexManifest = {
  ...pluginMetadata,
  skills: './skills/',
  mcpServers: './.mcp.json',
  interface: extensions['com.openai'].interface,
}
const sharedMetadata = Object.fromEntries(
  ['name', 'version', 'description', 'author', 'repository', 'license'].map(key => [key, plugin[key]]),
)
const claudeManifest = {
  ...sharedMetadata,
  mcpServers: {
    [packageInfo.name]: {
      command: 'npx',
      args: ['--yes', `${packageInfo.name}@${packageInfo.version}`, 'server'],
    },
  },
}
const cursorManifest = {
  ...sharedMetadata,
  skills: './skills/',
  mcpServers: {
    [packageInfo.name]: {
      type: 'stdio',
      command: 'npx',
      args: ['--yes', `${packageInfo.name}@${packageInfo.version}`, 'server'],
      cwd: '${CURSOR_PLUGIN_ROOT}',
    },
  },
}
const manifests = [
  ['.codex-plugin/plugin.json', codexManifest],
  ['.claude-plugin/plugin.json', claudeManifest],
  ['.cursor-plugin/plugin.json', cursorManifest],
]

if (process.argv[2] === '--sync') {
  copyFileSync(sourceLicense, packagedLicense)
  writeFileSync(path.join(pluginRoot, '.mcp.json'), `${JSON.stringify(codexMcp, null, 2)}\n`)
  for (const [relativePath, manifest] of manifests) {
    const manifestPath = path.join(pluginRoot, relativePath)
    mkdirSync(path.dirname(manifestPath), { recursive: true })
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
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
assert.deepEqual(readFileSync(packagedLicense), readFileSync(sourceLicense), 'packaged license must match its source')
assert.deepEqual(JSON.parse(readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8')), codexMcp, 'Codex MCP configuration must match the portable plugin')
for (const [relativePath, expectedManifest] of manifests) {
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(pluginRoot, relativePath), 'utf8')),
    expectedManifest,
    `${relativePath} must match the portable plugin`,
  )
}
for (const marketplacePath of [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/marketplace.json',
]) {
  const marketplace = JSON.parse(readFileSync(path.join(repositoryRoot, marketplacePath), 'utf8'))
  assert.equal(marketplace.name, plugin.name, `${marketplacePath} name must match the plugin`)
  assert.equal(marketplace.plugins.length, 1, `${marketplacePath} must expose one plugin`)
  assert.equal(marketplace.plugins[0].name, plugin.name, `${marketplacePath} plugin name must match`)
  assert.equal(marketplace.plugins[0].source?.path ?? marketplace.plugins[0].source, './agent-plugin', `${marketplacePath} source must point to the plugin`)
}
const skillName = readFileSync(packagedSkill, 'utf8').match(/^---\r?\nname: ([a-z0-9-]+)\r?\n/)?.[1]
assert.equal(skillName, path.basename(path.dirname(packagedSkill)), 'packaged skill directory must match its frontmatter name')

console.log('Agent plugin package is in sync')
