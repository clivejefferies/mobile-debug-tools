import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

export async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-disable-'))
  try {
    // create ambiguous project (contains both iOS and Android markers)
    const both = path.join(dir, 'both')
    await fs.mkdir(both)
    await fs.writeFile(path.join(both, 'Example.xcodeproj'), '')
    await fs.writeFile(path.join(both, 'gradlew'), '')

    const orig = process.env.MCP_DISABLE_AUTODETECT
    process.env.MCP_DISABLE_AUTODETECT = '1'

    const { ToolsManage } = await import('../../../src/tools/manage.js')

    try {
      const res = await ToolsManage.buildAndInstallHandler({ projectPath: both })
      console.log('result:', res.result)
      assert.strictEqual(res.result.success, false)
      assert.ok(String(res.result.error).includes('MCP_DISABLE_AUTODETECT'), 'Expected error to mention MCP_DISABLE_AUTODETECT')
      console.log('mcp_disable_autodetect test passed')
    } finally {
      if (orig === undefined) delete process.env.MCP_DISABLE_AUTODETECT
      else process.env.MCP_DISABLE_AUTODETECT = orig
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

run().catch(e => { console.error(e); process.exit(1) })