import assert from 'node:assert/strict'
import { copyFileSync, readFileSync } from 'node:fs'
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

if (process.argv[2] === '--sync') {
  copyFileSync(sourceSkill, packagedSkill)
  copyFileSync(sourceLicense, packagedLicense)
}
else if (process.argv[2] !== '--check') throw new Error('Use --sync or --check')

assert.equal(plugin.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
assert.equal(plugin.name, packageInfo.name)
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
const skillName = readFileSync(packagedSkill, 'utf8').match(/^---\r?\nname: ([a-z0-9-]+)\r?\n/)?.[1]
assert.equal(skillName, path.basename(path.dirname(packagedSkill)), 'packaged skill directory must match its frontmatter name')

console.log('Agent plugin package is in sync')
