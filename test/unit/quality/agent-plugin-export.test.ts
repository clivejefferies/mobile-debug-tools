import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const temporary = await mkdtemp(path.join(os.tmpdir(), 'agent-plugin-export-'))
const output = path.join(temporary, 'plugin')
const exportPlugin = () => spawnSync(process.execPath, ['scripts/agent-plugin.mjs', '--export-antigravity', output], { cwd: root, encoding: 'utf8', timeout: 10000 })
try {
  const exported = exportPlugin()
  assert.equal(exported.status, 0, exported.stderr)
  assert.deepEqual((await readdir(output)).sort(), ['LICENSE', 'README.md', 'assets', 'mcp_config.json', 'plugin.json', 'skills'])
  for (const directory of ['skills', 'assets']) {
    const files = await readdir(path.join(output, directory), { recursive: true })
    assert.ok(files.every(file => path.basename(file) !== '.DS_Store' && !path.basename(file).startsWith('._')), 'Export must exclude Finder metadata')
  }
  const manifest = JSON.parse(await readFile(path.join(output, 'plugin.json'), 'utf8'))
  assert.equal(manifest.$schema, 'https://antigravity.google/schemas/v1/plugin.json')
  assert.ok((await readFile(path.join(output, manifest.logo))).length > 0)
  const config = JSON.parse(await readFile(path.join(output, 'mcp_config.json'), 'utf8'))
  assert.equal(Object.keys(config.mcpServers).length, 1)
  const server = config.mcpServers['mobile-debug-mcp']
  assert.equal(server.command, 'npx')
  assert.equal(server.cwd, '${PLUGIN_DATA}')
  assert.equal('type' in server, false, 'Antigravity infers stdio transport; type causes a strict warning')
  const skill = 'skills/mobile-debug-mcp/SKILL.md'
  assert.deepEqual(await readFile(path.join(output, skill)), await readFile(path.join(root, 'agent-plugin', skill)))
  assert.deepEqual(await readFile(path.join(output, 'LICENSE')), await readFile(path.join(root, 'LICENSE')))
  await writeFile(path.join(output, 'keep.txt'), 'existing user data')
  assert.notEqual(exportPlugin().status, 0, 'Existing destinations must not be overwritten or merged')
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'existing user data')
  console.log('PASS Antigravity export: native inventory, shared skill/license, no foreign manifests, overwrite refusal')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
