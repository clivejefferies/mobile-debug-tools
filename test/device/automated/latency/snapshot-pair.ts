import { writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import assert from 'node:assert/strict'
import { computeScreenFingerprint } from '../../../../src/utils/ui/index.js'
import type { CaptureDebugSnapshotRawResponse, GetCurrentScreenResponse } from '../../../../src/types.js'
import { buildFixture } from '../../../fixtures/latency-journey-app/build.js'
import { BenchmarkSession, UnsafeMeasurement } from './end-to-end-session.js'
import { cleanupFixture, command, environment, fixturePresent, treeHash } from './end-to-end-environment.js'
import { summarizeAttempts, type Attempt } from './end-to-end-report.js'

const device = process.env.LATENCY_DEVICE_ID ?? ''
const baseline = process.env.SNAPSHOT_BASELINE_SERVER ?? ''
const baselineSource = process.env.SNAPSHOT_BASELINE_SOURCE_SHA ?? ''
assert.match(device, /^emulator-\d+$/)
assert.ok(isAbsolute(baseline) && /^[a-f0-9]{64}$/.test(baselineSource), 'Provide the frozen baseline server path and source hash')
const adb = (...args: string[]) => command('adb', ['-s', device, ...args])
const app = 'dev.mobiledebugmcp.latencyfixture'
const fixtureActivity = `${app}.MainActivity`
const options = { includeScreenshot: false, includeLogs: false }
const attempts: Attempt[] = []
const sessions = {
  baseline: new BenchmarkSession(device, true, baseline),
  candidate: new BenchmarkSession(device, true)
}
type Build = keyof typeof sessions
let installAttempted = false, launched = false, interrupted = false
let fatal: string | undefined, metadata: ReturnType<typeof environment> | undefined
let fixtureSha: string | undefined
let nativeFreshness = false
const baselineHash = treeHash(dirname(baseline))
const cleanup = { servers: false, fixture: false }

async function checkFixtureActivity(session: BenchmarkSession) {
  const screen = await session.call('get_current_screen', {}, [])
  assert.equal(screen.package, app)
  assert.equal(screen.activity, fixtureActivity)
}

function verifyFingerprint(raw: CaptureDebugSnapshotRawResponse) {
  const tree = raw.ui_tree
  assert.ok(tree && tree.device.id === device && tree.snapshot_revision)
  assert.equal(raw.snapshot_revision, tree.snapshot_revision)
  assert.equal(raw.captured_at_ms, tree.captured_at_ms)
  assert.match(raw.fingerprint ?? '', /^[a-f0-9]{64}$/)
  const current: GetCurrentScreenResponse = { device: tree.device, activity: fixtureActivity, package: app, shortActivity: '' }
  assert.equal(raw.fingerprint, computeScreenFingerprint(tree, current, 'android').fingerprint)
}

async function sample(build: Build, iteration: number) {
  if (interrupted) throw new UnsafeMeasurement('INTERRUPTED')
  const attempt: Attempt = { case: build, iteration, warmup: iteration < 3, success: false, setup_ms: 0, requests: [] }
  attempts.push(attempt)
  try {
    await checkFixtureActivity(sessions[build])
    const data = await sessions[build].call('capture_debug_snapshot', options, attempt.requests)
    const raw = data.raw as CaptureDebugSnapshotRawResponse
    assert.ok(raw.ui_tree?.elements.some(element => element.contentDescription === 'home-screen' || element.text === 'home-screen'))
    await checkFixtureActivity(sessions[build])
    if (build === 'candidate') {
      verifyFingerprint(raw)
      assert.equal(attempt.requests[0].tree.filter(event => event.type === 'acquisition_completed').length, 1)
    }
    attempt.success = true
  } catch (error) {
    attempt.failure = attempt.requests[0]?.failure ?? 'SNAPSHOT_ASSERTION_FAILED'
    if (error instanceof UnsafeMeasurement) throw error
  }
}

async function checkFreshness() {
  const candidate = sessions.candidate
  const before = (await candidate.call('capture_debug_snapshot', options, [])).raw as CaptureDebugSnapshotRawResponse
  await candidate.call('run_journey', { steps: [
    { id: 'open', type: 'tap', selector: { accessibility_id: 'saved-session' } },
    { id: 'check', type: 'assert', assertion: { kind: 'element_visible', selector: { accessibility_id: 'idle-detail' } }, timeoutMs: 15000 }
  ], defaults: { verificationMode: 'light' }, responseMode: 'compact' }, [])
  await checkFixtureActivity(candidate)
  const after = (await candidate.call('capture_debug_snapshot', options, [])).raw as CaptureDebugSnapshotRawResponse
  await checkFixtureActivity(candidate)
  verifyFingerprint(after)
  assert.ok(after.ui_tree?.elements.some(element => element.contentDescription === 'idle-detail'))
  assert.ok(after.snapshot_revision > before.snapshot_revision)
  assert.notEqual(after.fingerprint, before.fingerprint)
  nativeFreshness = true
}

async function main() {
  const stop = () => { interrupted = true; for (const session of Object.values(sessions)) session.abort() }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  try {
    assert.equal(adb('get-state'), 'device')
    assert.equal(adb('shell', 'getprop', 'ro.kernel.qemu'), '1')
    const apk = buildFixture()
    if (!fixturePresent(adb, app)) {
      installAttempted = true
      adb('install', apk)
    }
    const packagePath = adb('shell', 'pm', 'path', app).match(/^package:(.+)$/)?.[1]
    assert.ok(packagePath)
    fixtureSha = adb('shell', 'sha256sum', packagePath).split(/\s+/)[0]
    assert.match(fixtureSha, /^[a-f0-9]{64}$/)
    metadata = { ...environment(device, apk), fixture_sha256: fixtureSha }
    adb('shell', 'am', 'force-stop', app)
    launched = true
    adb('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`)
    for (const session of Object.values(sessions)) await session.connect()
    await sessions.baseline.call('expect_element_visible', { selector: { accessibility_id: 'home-screen' }, timeout_ms: 30000 }, [])
    for (let iteration = 0; iteration < 13; iteration++) {
      const order: Build[] = iteration % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']
      for (const build of order) {
        console.log(`Round ${iteration + 1}/13 ${build}`)
        await sample(build, iteration)
      }
    }
    await checkFreshness()
  } catch (error) { fatal = error instanceof UnsafeMeasurement ? error.message : 'SETUP_OR_FRESHNESS_FAILED' }
  finally {
    cleanup.servers = true
    for (const session of Object.values(sessions)) {
      try { await session.close(); cleanup.servers &&= session.transport.cleanupVerified }
      catch { cleanup.servers = false }
    }
    try {
      if (launched || installAttempted) cleanupFixture(adb, app, installAttempted)
      cleanup.fixture = true
    } catch { cleanup.fixture = false }
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
  }
  const summaries = summarizeAttempts(attempts)
  const prior = summaries.baseline
  const next = summaries.candidate
  const sourceStable = metadata?.source_sha256 === treeHash('src') && metadata?.build_sha256 === treeHash('dist') &&
    metadata?.harness_sha256 === treeHash('test/device/automated/latency') && baselineHash === treeHash(dirname(baseline))
  const passed = !fatal && !interrupted && sourceStable && cleanup.servers && cleanup.fixture && nativeFreshness &&
    attempts.length === 26 && attempts.every(attempt => attempt.success) && prior?.total_ms?.count === 10 && next?.total_ms?.count === 10 &&
    next.physical_reads < prior.physical_reads && next.total_ms.p50 <= prior.total_ms.p50 && next.total_ms.p95 < prior.total_ms.p95
  const report = { passed, fatal, interrupted, unrun_attempts: 26 - attempts.length, sourceStable, cleanup, nativeFreshness,
    metadata, expected_fixture_activity: fixtureActivity, fixture_installed_sha256: fixtureSha, baseline: { source_sha256: baselineSource, build_sha256: baselineHash }, summaries, attempts }
  writeFileSync('docs/benchmarks/end-to-end-latency/android-snapshot-pair.json', JSON.stringify(report, null, 2) + '\n')
  process.exitCode = passed ? 0 : 1
}

main().catch(() => { console.error('Snapshot comparison could not write its report'); process.exitCode = 1 })
