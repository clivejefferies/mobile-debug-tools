import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildReadinessFixture, readinessAppId } from '../../../fixtures/readiness-app/build.js'

const arg = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined }
async function run() {
  const platform = arg('--platform')
  const deviceId = arg('--id')
  const output = arg('--output')
  assert.ok(platform === 'android' || platform === 'ios')
  assert.ok(deviceId && output, '--id and --output are required')
  const repository = fileURLToPath(new URL('../../../../', import.meta.url))
  const client = new Client({ name: 'readiness-device-verification', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(repository, 'dist/server.js')], cwd: repository, stderr: 'pipe' })
  transport.stderr?.on('data', chunk => process.stderr.write(chunk))
  const evidence: any = { platform, deviceId, source: 'built dist/server.js over MCP stdio', checked_at: new Date().toISOString(), scenarios: [] }
  let fixture: ReturnType<typeof buildReadinessFixture> | undefined
  let installed = false
  let restoreApp: string | undefined
  const call = async (name: string, args: any = {}) => {
    const result = await client.callTool({ name, arguments: { platform, deviceId, ...args } }, undefined, { timeout: 120000 })
    const item: any = result.content.find((item: any) => item.type === 'text')
    return JSON.parse(item.text)
  }
  const record = (name: string, result: any) => { evidence.scenarios.push({ name, result }); return result }
  try {
    await client.connect(transport)
    evidence.server = client.getServerVersion()
    const devices = await call('list_devices', { appId: readinessAppId })
    const device = devices.devices.find((device: any) => device.id === deviceId)
    assert.ok(device?.simulator, 'fixture mutations require an explicitly selected simulator')
    assert.ok(!device.appInstalled, 'refuse to replace a pre-existing fixture app')
    if (platform === 'android') restoreApp = (await call('get_current_screen')).package
    fixture = buildReadinessFixture(platform)
    const install = await call('install_app', { projectType: 'native', appPath: fixture.artifact })
    assert.equal(install.installed, true, JSON.stringify(install))
    installed = true
    assert.equal((await call('start_app', { appId: readinessAppId, verificationMode: 'none', responseMode: 'compact' })).success, true)
    const tree = await call('get_ui_tree')
    assert.equal(tree.readiness.state, 'unknown', 'single-sample tree never settles')
    evidence.initial_tree = tree
    const target = tree.elements.find((element: any) => element.contentDescription === 'show-loader' || element.resourceId === 'show-loader' || element.text?.toLowerCase() === 'show loader')
    assert.ok(target?.bounds)
    const [left, top, right, bottom] = target.bounds
    const trigger = () => call('tap', { x: (left + right) / 2, y: (top + bottom) / 2, verificationMode: 'none', responseMode: 'compact' })
    const stable = record('stable foreground UI', await call('get_app_readiness'))
    assert.equal(stable.success, true, JSON.stringify(stable))
    assert.equal(stable.readiness.state, 'settled')
    assert.equal(stable.readiness.capabilities.unresponsive, false)
    evidence.scenarios.at(-1).status = 'pass'
    assert.equal((await trigger()).success, true)
    const loading = record('controlled loader observation', await call('get_app_readiness'))
    assert.equal(loading.readiness.state, 'loading', JSON.stringify(loading))
    evidence.scenarios.at(-1).status = 'pass'
    const bounded = record('bounded wait cannot claim readiness', await call('wait_for_app_ready', { timeoutMs: 100, pollIntervalMs: 100 }))
    assert.equal(bounded.success, false)
    assert.ok(bounded.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    assert.notEqual(bounded.readiness.state, 'unresponsive')
    evidence.scenarios.at(-1).status = 'pass'
    const predicate = record('visible predicate waits for loader completion', await call('wait_for_ui', { selector: { text: 'Ready' }, condition: 'visible', requireReady: true, timeout_ms: 30000, poll_interval_ms: 500 }))
    assert.equal(predicate.status, 'success', JSON.stringify(predicate))
    assert.equal(predicate.readiness.state, 'settled')
    const finished = await call('get_ui_tree')
    assert.ok(finished.elements.some((element: any) => element.text === 'Done'))
    evidence.scenarios.at(-1).status = 'pass'
    assert.equal((await trigger()).success, true)
    const changed = record('changed UI settles after loader', await call('wait_for_ui_change', { requireReady: true, timeout_ms: 30000, stability_window_ms: 0 }))
    assert.equal(changed.success, true, JSON.stringify(changed))
    assert.equal(changed.readiness.state, 'settled')
    evidence.scenarios.at(-1).status = 'pass'
    const wait = record('readiness wait succeeds on settled content', await call('wait_for_app_ready', { timeoutMs: 15000 }))
    assert.equal(wait.success, true)
    assert.equal(wait.readiness.state, 'settled')
    evidence.scenarios.at(-1).status = 'pass'
    evidence.status = 'pass'
    console.log(JSON.stringify({ platform, deviceId, status: 'pass', scenarios: evidence.scenarios.map((entry: any) => ({ name: entry.name, status: entry.status })), output }, null, 2))
  } catch (error) { evidence.status = 'fail'; evidence.error = String(error); throw error }
  finally {
    if (installed) {
      await call('terminate_app', { appId: readinessAppId }).catch(() => null)
      try {
        if (platform === 'android') execFileSync(process.env.ADB_PATH || path.join(process.env.HOME!, 'Library/Android/sdk/platform-tools/adb'), ['-s', deviceId!, 'uninstall', readinessAppId], { stdio: 'pipe', timeout: 30000 })
        else execFileSync('xcrun', ['simctl', 'uninstall', deviceId!, readinessAppId], { stdio: 'pipe', timeout: 30000 })
        evidence.cleanup = 'fixture uninstalled'
      } catch (error) { evidence.cleanup = String(error) }
      if (restoreApp) await call('start_app', { appId: restoreApp, verificationMode: 'none', responseMode: 'compact' }).catch(() => null)
    }
    if (fixture) rmSync(fixture.directory, { recursive: true, force: true })
    await writeFile(output!, JSON.stringify(evidence, null, 2))
    await client.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
