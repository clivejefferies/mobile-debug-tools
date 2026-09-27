import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildFixture } from '../../../fixtures/latency-journey-app/build.js'
import { summarize } from './report.js'

const appId = 'dev.mobiledebugmcp.latencyfixture'
const stepTimeoutMs = 30000
const targetWaitTimeoutMs = 10000
const verificationTimeoutMs = 60000
const deviceId = process.env.LATENCY_DEVICE_ID
if (!deviceId) throw new Error('Set LATENCY_DEVICE_ID to the named Android emulator serial')
const adb = (...args: string[]) => execFileSync('adb', ['-s', deviceId, ...args], { encoding: 'utf8', timeout: 30000 }).trim()
const apk = buildFixture()
const selectorMap = {
  savedSession: 'saved-session', idleDetail: 'idle-detail', activeDetail: 'active-detail',
  activate: 'activate', deactivate: 'deactivate', home: 'home', homeScreen: 'home-screen',
  stop: 'stop', stopped: 'stopped'
}
const selector = (id: string) => ({ accessibility_id: id })
const flow = [
  [selectorMap.savedSession, selectorMap.idleDetail], [selectorMap.activate, selectorMap.activeDetail],
  [selectorMap.home, selectorMap.homeScreen], [selectorMap.savedSession, selectorMap.activeDetail],
  [selectorMap.deactivate, selectorMap.idleDetail], [selectorMap.stop, selectorMap.stopped]
]
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], stderr: 'pipe' })
transport.stderr?.on('data', chunk => process.stderr.write(`[server] ${chunk.toString()}`))
const client = new Client({ name: 'latency-benchmark', version: '1.0' })
const raw: any[] = []
const requestSequence: Record<string, any[]> = {}
let sequence: any[] = []
let failedSelector: string | null = null
let failedTool: string | null = null
async function call(name: string, args: any) {
  failedTool = name
  sequence.push({ tool: name, ...args, appId: args.appId ? '[fixture]' : undefined, deviceId: undefined, steps: args.steps?.map((step: any) => ({ ...step, appId: step.appId ? '[fixture]' : undefined })) })
  const start = performance.now()
  let response
  try {
    response = await client.callTool({ name, arguments: { platform: 'android', deviceId, ...args } }, undefined, { timeout: 300_000 })
  } catch (error) {
    console.error(`MCP ${name} rejected: ${error instanceof Error ? error.stack : String(error)}`)
    throw error
  }
  const elapsed = performance.now() - start
  const text = (response.content as any[]).find(item => item.type === 'text')?.text
  let data: any
  try { data = JSON.parse(text) } catch { data = {} }
  if (response.isError || data.success === false || data.status === 'timeout' || data.error) {
    const failed = args.steps?.find((step: any) => step.id === data.stopped_at_step_id)
    if (failed) { failedSelector = failed.selector?.accessibility_id ?? failed.assertion?.selector?.accessibility_id ?? null; failedTool = `run_journey:${failed.id}` }
    throw new Error('Fixture step failed')
  }
  return { data, elapsed }
}
async function run(mode: string) {
  sequence = []
  failedSelector = null
  failedTool = null
  adb('shell', 'am', 'force-stop', appId)
  try { adb('shell', 'pm', 'clear', appId) } catch { /* First install has no app data. */ }
  adb('install', '-r', apk)
  // Check the reset state outside the measured MCP flow, then force-stop once more.
  failedTool = 'reset-state'
  failedSelector = selectorMap.savedSession
  adb('shell', 'am', 'start', '-n', `${appId}/.MainActivity`)
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml')
  if (!adb('shell', 'cat', '/sdcard/ui.xml').includes(`content-desc="${selectorMap.savedSession}"`)) throw new Error('Reset selector missing')
  adb('shell', 'am', 'force-stop', appId)
  sequence = []
  const requestTimes: number[] = []
  const componentTimes: Record<string, number[]> = {}
  const record = (response: any) => {
    requestTimes.push(response.elapsed)
    const timing = response.data.timing ?? {}
    const components = Object.entries(timing).filter(([key, value]) => key !== 'total_ms' && typeof value === 'number')
    const stepTimings = (response.data.steps ?? []).flatMap((step: any) => Object.entries(step.result?.timing ?? {}))
    const selected = components.length ? components : stepTimings
    for (const [key, value] of selected) if (typeof value === 'number') (componentTimes[key] ??= []).push(value)
  }
  if (mode === 'baseline') {
    record(await call('start_app', { appId, actionTimeoutMs: stepTimeoutMs, verificationTimeoutMs }))
    for (const [target, expected] of flow) {
      failedSelector = target
      const found = await call('wait_for_ui', { selector: selector(target), condition: 'clickable', timeout_ms: targetWaitTimeoutMs, poll_interval_ms: 100 })
      record(found)
      record(await call('tap_element', { elementId: found.data.element.elementId, actionTimeoutMs: stepTimeoutMs, verificationTimeoutMs }))
      failedSelector = expected
      record(await call('expect_element_visible', { selector: selector(expected), timeout_ms: stepTimeoutMs, poll_interval_ms: 100 }))
    }
  } else {
    const steps: any[] = [{ id: 'launch', type: 'start_app', appId }]
    flow.forEach(([target, expected], index) => {
      steps.push({ id: `tap-${index}`, type: 'tap', selector: selector(target), waitFor: { condition: 'clickable', timeoutMs: targetWaitTimeoutMs, pollIntervalMs: 100 } })
      steps.push({ id: `assert-${index}`, type: 'assert', assertion: { kind: 'element_visible', selector: selector(expected) }, timeoutMs: stepTimeoutMs, pollIntervalMs: 100 })
    })
    record(await call('run_journey', { defaults: { verificationMode: mode === 'full' ? 'full' : 'light', actionTimeoutMs: stepTimeoutMs, verificationTimeoutMs }, responseMode: mode === 'full' ? 'debug' : 'compact', steps }))
  }
  requestSequence[mode] ??= sequence
  const screenshot = await call('capture_screenshot', {})
  const snapshot = await call('capture_debug_snapshot', { includeScreenshot: false, includeLogs: false })
  return { total_ms: requestTimes.reduce((a, b) => a + b, 0), componentTimes, screenshot_ms: screenshot.elapsed, snapshot_ms: snapshot.elapsed }
}
async function main() {
  await client.connect(transport)
  try {
    for (const mode of ['baseline', 'full', 'light']) {
      for (let iteration = 0; iteration < 13; iteration++) {
        console.log(`${mode} ${iteration + 1}/13`)
        try { raw.push({ mode, warmup: iteration < 3, success: true, ...await run(mode) }) }
        catch (error) { const message = error instanceof Error ? error.message : String(error); console.error(`${mode} run failed at ${failedTool}/${failedSelector}: ${message}`); raw.push({ mode, warmup: iteration < 3, success: false, failed_selector: failedSelector, failed_tool: failedTool, error: message }) }
      }
    }
  } finally { await client.close() }
  const modes = Object.fromEntries(['baseline', 'full', 'light'].map(mode => {
    const samples = raw.filter(item => item.mode === mode && !item.warmup && item.success)
    const failures = raw.filter(item => item.mode === mode && !item.success)
    return [mode, { failures: failures.length, first_failure: failures[0] ? { selector: failures[0].failed_selector, tool_or_step: failures[0].failed_tool } : null, total_ms: summarize(samples.map(item => item.total_ms)), screenshot_ms: summarize(samples.map(item => item.screenshot_ms)), snapshot_ms: summarize(samples.map(item => item.snapshot_ms)), components: Object.fromEntries([...new Set(samples.flatMap(item => Object.keys(item.componentTimes)))].map(key => [key, summarize(samples.flatMap(item => item.componentTimes[key] ?? []))])) }]
  })) as any
  const report = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), working_tree: 'candidate',
    server_version: JSON.parse(readFileSync('package.json', 'utf8')).version,
    platform: 'android', model: adb('shell', 'getprop', 'ro.product.model'), os: adb('shell', 'getprop', 'ro.build.version.release'), api: adb('shell', 'getprop', 'ro.build.version.sdk'), emulator_image: adb('emu', 'avd', 'name').split('\n')[0].trim(), display_size: adb('shell', 'wm', 'size'), display_density: adb('shell', 'wm', 'density'), adb_timeout_ms: Number(process.env.MCP_ADB_TIMEOUT ?? 20000),
    fixture_version: '1.0', fixture_sha256: createHash('sha256').update(readFileSync(apk)).digest('hex'), warmup_runs: 3, measured_runs: 10,
    modes, requests: requestSequence, raw,
    gates: { full_p95: !!modes.baseline.total_ms && !!modes.full.total_ms && modes.full.total_ms.p95 <= modes.baseline.total_ms.p95 * 1.1, light_p50: !!modes.full.total_ms && !!modes.light.total_ms && modes.light.total_ms.p50 <= modes.full.total_ms.p50 * .7 }
  }
  const root = 'docs/benchmarks/interaction-latency'
  mkdirSync(root, { recursive: true })
  writeFileSync(`${root}/final.json`, JSON.stringify(report, null, 2))
  writeFileSync(`${root}/final.md`, `# Interaction latency benchmark\n\nCommit: ${report.commit} (working tree candidate). Fixture: ${report.fixture_version}, SHA-256 ${report.fixture_sha256}.\n\nEnvironment: ${report.emulator_image}, Android ${report.os}, API ${report.api}. Three warm-ups and ten measured runs per mode. Failed runs excluded.\n\n| Mode | p50 ms | p95 ms | Failures |\n|---|---:|---:|---:|\n${Object.entries(modes).map(([mode, value]: [string, any]) => `| ${mode} | ${value.total_ms?.p50 ?? 'n/a'} | ${value.total_ms?.p95 ?? 'n/a'} | ${value.failures} |`).join('\n')}\n\nFirst failure by mode: ${Object.entries(modes).map(([mode, value]: [string, any]) => `${mode}: ${value.first_failure ? `${value.first_failure.tool_or_step} / ${value.first_failure.selector ?? 'no selector'}` : 'none'}`).join('; ')}.\n\nFull p95 gate: ${report.gates.full_p95}. Light p50 gate: ${report.gates.light_p50}.\n\nSee final.json for requests, timing components, and failure selectors.\n`)
  if (!report.gates.full_p95 || !report.gates.light_p50) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
