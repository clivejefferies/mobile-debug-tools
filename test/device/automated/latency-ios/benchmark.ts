import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { getIdbCmd } from '../../../../src/utils/ios/utils.js'
import { BenchmarkSession, UnsafeMeasurement } from '../latency/end-to-end-session.js'
import { command, treeHash } from '../latency/end-to-end-environment.js'
import { summarizeAttempts, observationOverhead, type Attempt } from '../latency/end-to-end-report.js'

const deviceId = process.env.IOS_LATENCY_DEVICE_ID
if (!deviceId) throw new Error('Set IOS_LATENCY_DEVICE_ID to an explicit isolated, booted simulator')
const appId = 'com.apple.Preferences'
const smoke = process.argv.includes('--smoke')
const rounds = smoke ? 1 : 13
const warmups = smoke ? 0 : 3
const cases = ['screenshot-on', 'screenshot-off', 'tree-on', 'tree-off', 'snapshot-on', 'snapshot-off']
const attempts: Attempt[] = []
const sessions = new Map<boolean, BenchmarkSession>()
const phases: { phase: string; elapsed_ms: number; success: boolean }[] = []
const startedAt = new Date().toISOString()
const cleanup = { servers: false, settings: false }
const controller = new AbortController()
let fatal: string | undefined
let sourceStable: boolean | undefined
let metadata: Record<string, unknown> | undefined
let startedSettings = false
const root = 'docs/benchmarks/end-to-end-latency'
const file = smoke ? 'ios-smoke' : 'ios-observations'
const fingerprint = () => ({ source: treeHash('src'), build: treeHash('dist'),
  shared_harness: treeHash('test/device/automated/latency'), ios_harness: treeHash('test/device/automated/latency-ios') })
const identity = fingerprint()
function idbVersion() {
  try {
    const interpreter = readFileSync(getIdbCmd(), 'utf8').split('\n')[0].replace(/^#!/, '').trim().split(/\s+/)
    return command(interpreter[0], [...interpreter.slice(1), '-c', 'import importlib.metadata; print(importlib.metadata.version("fb-idb"))'])
  } catch { return 'unavailable' }
}
async function phase<T>(name: string, operation: () => T | Promise<T>) {
  const start = performance.now()
  let success = false
  try { const value = await operation(); success = true; return value }
  finally { phases.push({ phase: name, elapsed_ms: performance.now() - start, success }) }
}
function save() {
  mkdirSync(root, { recursive: true })
  const summaries = summarizeAttempts(attempts)
  const status = fatal ? 'stopped' : attempts.length === rounds * cases.length ? 'finished' : 'in_progress'
  const outcome = fatal || attempts.some(value => !value.success) || controller.signal.aborted ? 'fail' : cleanup.servers && cleanup.settings ? 'pass' : 'pending'
  writeFileSync(`${root}/${file}.json`, JSON.stringify({ status, outcome, started_at: startedAt,
    performance_evidence: !smoke && sourceStable !== false, smoke, warmups, measured_attempts_per_case: smoke ? 1 : 10,
    source_and_build_unchanged: sourceStable, identity, metadata, phases, fatal, cleanup,
    unrun_attempts: rounds * cases.length - attempts.length,
    invocation: `IOS_LATENCY_DEVICE_ID=[simulator] npx tsx test/device/automated/latency-ios/benchmark.ts${smoke ? ' --smoke' : ''}`,
    summaries, observation_overhead: observationOverhead(attempts), attempts }, null, 2) + '\n')
  const rows = Object.entries(summaries).map(([name, value]) => `| ${name} | ${value.total_ms?.count ?? 0}/${value.attempts} | ${value.total_ms?.p50.toFixed(1) ?? 'n/a'} | ${value.total_ms?.p95.toFixed(1) ?? 'n/a'} | ${value.failures} | ${value.warmup_failures} |`)
  writeFileSync(`${root}/${file}.md`, `# iOS standalone observation ${smoke ? 'smoke (not performance evidence)' : 'baseline'}\n\nStatus: ${status}; outcome: ${outcome}. Stable screen: Settings root on an isolated simulator. No fixture journey or physical iOS claim.\n\n| Case | Successful/measured | p50 ms | p95 ms | Failures | Warm-up failures |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n\nSee ${file}.json for environment/build identity, all attempts, phase timings and inclusive timing diagnostics. Ten samples give a preliminary tail estimate. Failed attempts stay visible and fail the run. Probe comparisons include device variability; nested intervals cannot be summed. Application work remains in round trips. The shared #89 fixture remains required for equivalent static/network journeys.\n`)
}
async function sample(name: string, iteration: number) {
  if (controller.signal.aborted) throw new UnsafeMeasurement('INTERRUPTED')
  const value: Attempt = { case: name, iteration, warmup: iteration < warmups, success: false, setup_ms: 0, requests: [] }
  attempts.push(value)
  const session = sessions.get(!name.endsWith('-off'))!
  const setupStarted = performance.now()
  try {
    await session.call('expect_element_visible', { platform: 'ios', selector: { text: 'Settings' }, timeout_ms: 30000, poll_interval_ms: 100 }, [])
    value.setup_ms = performance.now() - setupStarted
    const tool = name.startsWith('screenshot') ? 'capture_screenshot' : name.startsWith('tree') ? 'get_ui_tree' : 'capture_debug_snapshot'
    await session.call(tool, { platform: 'ios', ...(tool === 'capture_debug_snapshot' ? { includeScreenshot: false, includeLogs: false } : {}) }, value.requests)
    value.success = true
  } catch (error) {
    if (!value.setup_ms) value.setup_ms = performance.now() - setupStarted
    value.failure = error instanceof UnsafeMeasurement ? error.message : value.requests.at(-1)?.failure ?? 'SETUP_FAILED'
    if (error instanceof UnsafeMeasurement) throw error
  } finally { save() }
}
async function main() {
  const interrupt = () => { controller.abort(); for (const session of sessions.values()) session.abort() }
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  try {
    const discovery = JSON.parse(command('xcrun', ['simctl', 'list', 'devices', 'booted', '--json']))
    const devices = discovery.devices as Record<string, { udid: string; name: string; state: string }[]>
    const runtime = Object.entries(devices).find(([, list]) => list.some(device => device.udid === deviceId && device.state === 'Booted'))
    if (!runtime) throw new UnsafeMeasurement('BOOTED_SIMULATOR_REQUIRED')
    const runtimes = JSON.parse(command('xcrun', ['simctl', 'list', 'runtimes', '--json'])).runtimes as { identifier: string; version: string; buildversion: string }[]
    const runtimeInfo = runtimes.find(value => value.identifier === runtime[0])
    metadata = { platform: 'ios', model: runtime[1].find(device => device.udid === deviceId)?.name,
      runtime: runtime[0], os: runtimeInfo?.version, runtime_build: runtimeInfo?.buildversion,
      screen: 'Settings root; English required; caller-provided isolated simulator', node: process.version,
      host: { platform: os.platform(), release: os.release(), arch: os.arch() },
      package_version: JSON.parse(readFileSync('package.json', 'utf8')).version,
      commit: command('git', ['rev-parse', 'HEAD']), working_tree: command('git', ['status', '--porcelain', '--untracked-files=all']),
      tool_versions: { xcode: command('xcodebuild', ['-version']), idb: idbVersion() },
      timeouts: { setup_ms: 30000, call_ms: 300000, readiness_ms: 30000 },
      journey: 'blocked: shared #89 static/network fixture unavailable', physical_ios: 'excluded' }
    await phase('launch_settings', () => command('xcrun', ['simctl', 'launch', deviceId!, appId])); startedSettings = true
    for (const enabled of [true, false]) {
      const session = new BenchmarkSession(deviceId!, enabled)
      sessions.set(enabled, session)
      await phase(`server_startup_metrics_${enabled}`, () => session.connect())
      await phase(`stable_screen_assertion_metrics_${enabled}`, () => session.call('expect_element_visible',
        { platform: 'ios', selector: { text: 'Settings' }, timeout_ms: 30000, poll_interval_ms: 100 }, []))
      if (enabled) {
        const tree = await phase('screen_metadata', () => session.call('get_ui_tree', { platform: 'ios' }, []))
        metadata.resolution = tree.resolution
      }
    }
    save()
    for (let iteration = 0; iteration < rounds; iteration++) for (const name of iteration % 2 ? [...cases].reverse() : cases) {
      console.log(`${smoke ? 'smoke' : `round ${iteration + 1}/${rounds}`} ${name}`)
      await sample(name, iteration)
    }
  } catch (error) { fatal = error instanceof UnsafeMeasurement ? error.message : 'PREREQUISITE_FAILED'; process.exitCode = 1 }
  finally {
    cleanup.servers = true
    for (const session of sessions.values()) {
      try { await session.close(); cleanup.servers &&= session.transport.cleanupVerified }
      catch { cleanup.servers = false }
    }
    try { if (startedSettings) command('xcrun', ['simctl', 'terminate', deviceId!, appId]); cleanup.settings = true }
    catch { cleanup.settings = false }
    sourceStable = JSON.stringify(identity) === JSON.stringify(fingerprint())
    if (!sourceStable) fatal = 'MEASURED_SOURCE_CHANGED'
    if (!cleanup.servers || !cleanup.settings) fatal = 'CLEANUP_FAILED'
    if (fatal || attempts.some(value => !value.success) || controller.signal.aborted) process.exitCode = 1
    save(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
  }
}
main().catch(() => { console.error('iOS observation benchmark failed; inspect report'); process.exitCode = 1 })
