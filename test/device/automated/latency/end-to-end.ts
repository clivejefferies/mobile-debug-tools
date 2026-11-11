import { mkdirSync, writeFileSync } from 'node:fs'
import { buildFixture } from '../../../fixtures/latency-journey-app/build.js'
import { BenchmarkSession, UnsafeMeasurement } from './end-to-end-session.js'
import { cleanupFixture, command, environment, fixturePresent, treeHash } from './end-to-end-environment.js'
import { summarizeAttempts, observationOverhead, type Attempt } from './end-to-end-report.js'

const deviceId = process.env.LATENCY_DEVICE_ID
if (!deviceId || !deviceId.startsWith('emulator-')) throw new Error('Set LATENCY_DEVICE_ID to an explicit Android emulator serial')
const adb = (...args: string[]) => command('adb', ['-s', deviceId, ...args])
const appId = 'dev.mobiledebugmcp.latencyfixture'
const smoke = process.argv.includes('--smoke')
const rounds = smoke ? 1 : 13
const warmups = smoke ? 0 : 3
const cases = ['standalone', 'full-debug', 'full-compact', 'light-debug', 'light-compact',
  'screenshot-on', 'screenshot-off', 'tree-on', 'tree-off', 'snapshot-on', 'snapshot-off']
const flow = [['saved-session', 'idle-detail'], ['activate', 'active-detail'], ['home', 'home-screen'],
  ['saved-session', 'active-detail'], ['deactivate', 'idle-detail'], ['stop', 'stopped']]
const selector = (id: string) => ({ accessibility_id: id })
const controls = { actionTimeoutMs: 30000, verificationTimeoutMs: 60000 }
const attempts: Attempt[] = []
const phases: { phase: string; elapsed_ms: number; success: boolean }[] = []
const sessions = new Map<boolean, BenchmarkSession>()
const cleanup: { server?: boolean; fixture?: boolean; removed_install?: boolean } = {}
let metadata: ReturnType<typeof environment> | undefined
let interrupted = false
let fatal: string | undefined
let fixtureExisted = false
let installAttempted = false
let sourceStable: boolean | undefined
const startedAt = new Date().toISOString()
const root = 'docs/benchmarks/end-to-end-latency'
const reportName = smoke ? 'smoke' : 'baseline'
async function phase<T>(name: string, operation: () => T | Promise<T>) {
  const start = performance.now()
  let success = false
  try { const result = await operation(); success = true; return result }
  finally { phases.push({ phase: name, elapsed_ms: performance.now() - start, success }) }
}
function save() {
  mkdirSync(root, { recursive: true })
  const summaries = summarizeAttempts(attempts)
  const report = { status: fatal ? 'stopped' : interrupted ? 'interrupted' : attempts.length === rounds * cases.length ? 'finished' : 'in_progress',
    performance_evidence: !smoke && sourceStable !== false, smoke, warmups, measured_attempts_per_case: smoke ? 1 : 10,
    started_at: startedAt, source_and_build_unchanged: sourceStable,
    planned_cases: cases, unrun_attempts: rounds * cases.length - attempts.length,
    outcome: fatal || interrupted || attempts.some(value => !value.success) || cleanup.server === false || cleanup.fixture === false ? 'fail' : cleanup.server && cleanup.fixture ? 'pass' : 'pending',
    invocation: `LATENCY_DEVICE_ID=[emulator] MCP_ADB_TIMEOUT=${process.env.MCP_ADB_TIMEOUT ?? '20000'} npx tsx test/device/automated/latency/end-to-end.ts${smoke ? ' --smoke' : ''}`,
    metadata, phases, fatal, cleanup, summaries, observation_overhead: observationOverhead(attempts), attempts }
  writeFileSync(`${root}/${reportName}.json`, JSON.stringify(report, null, 2) + '\n')
  const rows = Object.entries(summaries).map(([name, value]) => `| ${name} | ${value.total_ms?.count ?? 0}/${value.attempts} | ${value.total_ms?.p50.toFixed(1) ?? 'n/a'} | ${value.total_ms?.p95.toFixed(1) ?? 'n/a'} | ${value.failures} | ${value.warmup_failures} |`)
  writeFileSync(`${root}/${reportName}.md`, `# End-to-end latency ${smoke ? 'smoke (not performance evidence)' : 'baseline'}\n\nStatus: ${report.status}. Build: ${metadata?.build_sha256 ?? 'unavailable'}.\n\n| Case | Successful/measured | p50 ms | p95 ms | Failures | Warm-up failures |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n\nSee ${reportName}.json for exact source/build hashes, environment, phase durations, attempt order, inclusive components and failure records. Percentiles use the successful measured count shown for each case. With 1–19 successful samples, nearest-rank p95 is the sample maximum. Zero successful samples yield no percentiles. Failed attempts are excluded from percentiles, retained in raw data, and fail the run.\n\nIntervals can overlap; component sums are not an additive latency budget. Client-minus-handler includes scheduling, transport and uninstrumented work. Handler residual excludes the union of recorded spans. Tree acquisition/parse/retry events are separate nested diagnostics. Application work inside requests remains included. Startup, fixture builds/resets and external validation are excluded from steady-state round trips. SDK wire serialization is not isolated.\n`)
}
async function reset(session: BenchmarkSession, observation: boolean) {
  adb('shell', 'am', 'force-stop', appId)
  if (!adb('shell', 'pm', 'clear', appId).includes('Success')) throw new Error('RESET_FAILED')
  if (observation) {
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`)
    await session.call('expect_element_visible', { selector: selector('home-screen'), timeout_ms: 30000, poll_interval_ms: 100 }, [])
  }
}
async function journey(session: BenchmarkSession, mode: string, attempt: Attempt) {
  if (mode === 'standalone') {
    await session.call('start_app', { appId, ...controls }, attempt.requests)
    for (const [target, expected] of flow) {
      const found = await session.call('wait_for_ui', { selector: selector(target), condition: 'clickable', timeout_ms: 10000, poll_interval_ms: 100 }, attempt.requests)
      const element = found.element as { elementId?: string } | undefined
      if (!element?.elementId) throw new Error('TARGET_HANDLE_MISSING')
      await session.call('tap_element', { elementId: element.elementId, ...controls }, attempt.requests)
      await session.call('expect_element_visible', { selector: selector(expected), timeout_ms: 30000, poll_interval_ms: 100 }, attempt.requests)
    }
    return
  }
  const [verificationMode, responseMode] = mode.split('-')
  const steps: Record<string, unknown>[] = [{ id: 'launch', type: 'start_app', appId }]
  flow.forEach(([target, expected], index) => {
    steps.push({ id: `tap-${index}`, type: 'tap', selector: selector(target), waitFor: { condition: 'clickable', timeoutMs: 10000, pollIntervalMs: 100 } })
    steps.push({ id: `assert-${index}`, type: 'assert', assertion: { kind: 'element_visible', selector: selector(expected) }, timeoutMs: 30000, pollIntervalMs: 100 })
  })
  await session.call('run_journey', { defaults: { verificationMode, ...controls }, responseMode, steps }, attempt.requests)
}
async function attempt(name: string, iteration: number) {
  if (interrupted) throw new UnsafeMeasurement('INTERRUPTED')
  const instrumented = !name.endsWith('-off')
  const session = sessions.get(instrumented)!
  const observation = /^(screenshot|tree|snapshot)-/.test(name)
  const value: Attempt = { case: name, iteration, warmup: iteration < warmups, success: false, setup_ms: 0, requests: [] }
  attempts.push(value)
  const start = performance.now()
  try {
    await reset(session, observation)
    value.setup_ms = performance.now() - start
    if (!observation) await journey(session, name, value)
    else {
      const tool = name.startsWith('screenshot') ? 'capture_screenshot' : name.startsWith('tree') ? 'get_ui_tree' : 'capture_debug_snapshot'
      await session.call(tool, tool === 'capture_debug_snapshot' ? { includeScreenshot: false, includeLogs: false } : {}, value.requests)
    }
    value.success = true
  } catch (error) {
    if (!value.setup_ms) value.setup_ms = performance.now() - start
    value.failure = error instanceof UnsafeMeasurement ? error.message : value.requests.at(-1)?.failure ?? 'SETUP_OR_ASSERTION_FAILED'
    if (error instanceof UnsafeMeasurement || !value.requests.length) throw new UnsafeMeasurement(value.failure)
  } finally { save() }
}
async function main() {
  const signal = () => { interrupted = true; for (const session of sessions.values()) session.abort() }
  process.on('SIGINT', signal); process.on('SIGTERM', signal)
  try {
    if (adb('get-state') !== 'device' || adb('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw new Error('EMULATOR_REQUIRED')
    fixtureExisted = fixturePresent(adb, appId)
    const apk = await phase('fixture_build', buildFixture)
    metadata = environment(deviceId!, apk)
    installAttempted = true
    await phase('fixture_install', () => adb('install', '-r', apk))
    for (const enabled of [true, false]) {
      const session = new BenchmarkSession(deviceId!, enabled)
      sessions.set(enabled, session)
      await phase(`server_startup_metrics_${enabled}`, () => session.connect())
    }
    for (let round = 0; round < rounds; round++) {
      const order = round % 2 ? [...cases].reverse() : cases
      for (const name of order) {
        console.log(`${smoke ? 'smoke' : `round ${round + 1}/${rounds}`} ${name}`)
        await attempt(name, round)
      }
    }
  } catch (error) {
    fatal = error instanceof UnsafeMeasurement ? error.message : 'PREREQUISITE_OR_CLEANUP_FAILED'
    process.exitCode = 1
  } finally {
    cleanup.server = true
    for (const session of sessions.values()) {
      try { await session.close(); cleanup.server &&= session.transport.cleanupVerified }
      catch { cleanup.server = false }
    }
    try {
      if (installAttempted && cleanupFixture(adb, appId, !fixtureExisted)) cleanup.removed_install = true
      cleanup.fixture = true
    } catch { cleanup.fixture = false }
    if (!cleanup.server || !cleanup.fixture || interrupted || attempts.some(value => !value.success)) process.exitCode = 1
    if (!cleanup.server || !cleanup.fixture) fatal = 'CLEANUP_FAILED'
    if (metadata) {
      sourceStable = metadata.source_sha256 === treeHash('src') && metadata.build_sha256 === treeHash('dist') && metadata.harness_sha256 === treeHash('test/device/automated/latency')
      if (!sourceStable) { fatal = 'MEASURED_SOURCE_CHANGED'; process.exitCode = 1 }
    }
    save()
    process.off('SIGINT', signal); process.off('SIGTERM', signal)
  }
}
main().catch(() => { console.error('Benchmark failed; inspect timing report'); process.exitCode = 1 })
