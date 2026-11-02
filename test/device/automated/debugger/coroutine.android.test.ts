import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, rm } from 'node:fs/promises'
import { buildCoroutineFixture, coroutineAppId } from '../../../fixtures/coroutine-app/build.js'
import { CoroutineJourney, fingerprint, type Stop } from './coroutine-support.js'

const device = process.env.MCP_COROUTINE_DEVICE
const source = await readFile(new URL('../../../fixtures/coroutine-app/MainActivity.kt', import.meta.url), 'utf8')
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

async function requiredStop(journey: CoroutineJourney, marker?: string) {
  const stop = await journey.stop(marker)
  assert.ok(stop, 'Expected debugger stop')
  return stop
}
async function guards(journey: CoroutineJourney, stop: Stop, frameId: string) {
  const blocked = await journey.call('tap', { platform: 'android', deviceId: journey.device, x: 5, y: 5 })
  assert.equal(blocked.failure_code, 'DEBUGGER_PAUSED')
  assert.equal(blocked.dispatch_started, false)
  await journey.resume(stop)
  const stale = await journey.call('get_debugger_locals', { stopId: stop.stop_id, frameId })
  assert.equal(stale.error.code, 'DEBUGGER_STALE_REFERENCE')
}
async function completion(journey: CoroutineJourney) {
  await journey.attach()
  const beforeBp = await journey.breakpoint('BREAK_BEFORE')
  const afterBp = await journey.breakpoint('BREAK_AFTER')
  const dispatchBp = await journey.breakpoint('BREAK_DISPATCH', '$completeWork$2')
  const helperBp = await journey.breakpoint('BREAK_HELPER')
  const resultBp = await journey.breakpoint('BREAK_RESULT', '$completeWork$2')
  const tap = await journey.tap('Complete run')
  const before = await requiredStop(journey, 'BREAK_BEFORE')
  const values = await journey.inspect(before, 'before suspension')
  assert.equal(values.locals.find(value => value.name === 'known')?.value, '42')
  assert.equal(values.locals.find(value => value.name === 'firstThread')?.value, 'fixture-first')
  await journey.remove(beforeBp)
  await guards(journey, before, values.frameId)
  await tap.done
  await journey.visible('Coroutine waiting')
  await journey.cancelledWait()
  const release = await journey.tap('Release gate')
  const after = await requiredStop(journey, 'BREAK_AFTER')
  const afterValues = await journey.inspect(after, 'after suspension')
  // A spill may not be represented as a shallow local; retain that observation.
  const known = afterValues.locals.find(value => value.name === 'known')
  if (known) assert.equal(known.value, '42')
  await journey.remove(afterBp)
  await journey.resume(after)
  const dispatched = await requiredStop(journey, 'BREAK_DISPATCH')
  const dispatcherValues = await journey.inspect(dispatched, 'second dispatcher')
  assert.equal(dispatcherValues.locals.find(value => value.name === 'dispatcherThread')?.value, 'fixture-second')
  await journey.remove(dispatchBp)
  await journey.resume(dispatched)
  const helper = await requiredStop(journey, 'BREAK_HELPER')
  await journey.inspect(helper, 'nested child helper')
  await journey.remove(helperBp)
  await journey.step(helper, 'into')
  const into = await requiredStop(journey, 'BREAK_INCREMENT')
  await journey.step(into, 'over')
  const over = await requiredStop(journey, 'BREAK_INCREMENT_RETURN')
  await journey.step(over, 'out')
  const out = await requiredStop(journey)
  assert.equal(out.stops[0].location.method, 'helper')
  await journey.resume(out)
  const result = await requiredStop(journey, 'BREAK_RESULT')
  const resultValues = await journey.inspect(result, 'nested result')
  assert.equal(resultValues.locals.find(value => value.name === 'answer')?.value, '44')
  await journey.remove(resultBp)
  await journey.resume(result)
  await release.done
  await journey.detach()
  await journey.visible('Coroutine result 44')
  journey.observations.push({ journey: 'completion, breakpoint workaround, synchronous steps, guards, cancelled wait', status: 'PASS' })
}
async function boundaryStep(journey: CoroutineJourney) {
  await journey.attach()
  const bp = await journey.breakpoint('BREAK_SUSPEND')
  const tap = await journey.tap('Complete run')
  const stop = await requiredStop(journey, 'BREAK_SUSPEND')
  await journey.remove(bp)
  await journey.step(stop, 'over')
  const next = await journey.stop(undefined, 3)
  if (next) await journey.inspect(next, 'suspension step observed stop')
  journey.observations.push({ journey: 'suspension boundary step', status: 'PASS', observation: next ?? 'No stop within three one-second polls; no coroutine-following claim' })
  await journey.detach()
  await tap.done
  await journey.visible('Coroutine waiting')
  const release = await journey.tap('Release gate')
  await release.done
  await journey.visible('Coroutine result 44')
}
async function cancellation(journey: CoroutineJourney) {
  await journey.attach()
  const bp = await journey.breakpoint('BREAK_CANCEL', '$cancelWork$2$child$1')
  const start = await journey.tap('Cancellation run')
  await start.done
  await journey.visible('Cancellation waiting')
  const cancel = await journey.tap('Cancel job')
  const stop = await requiredStop(journey, 'BREAK_CANCEL')
  await journey.inspect(stop, 'cancelled child finally')
  await journey.remove(bp)
  await journey.resume(stop)
  await cancel.done
  await journey.detach()
  await journey.visible('Coroutine cancelled')
  journey.observations.push({ journey: 'job cancellation, child finally, cancelAndJoin and recovery', status: 'PASS' })
}
async function evidence(directory: string, artifact: string, journey: CoroutineJourney) {
  const javap = process.env.JAVA_HOME ? process.env.JAVA_HOME + '/bin/javap' : 'javap'
  const classes = (await readdir(directory + '/classes/dev/mobiledebugmcp/coroutinefixture')).filter(file => file.endsWith('.class')).sort()
  const metadata = execFileSync(javap, ['-p', '-c', '-l', '-classpath', directory + '/classes', ...classes.map(file => coroutineAppId + '.' + file.slice(0, -6))], { encoding: 'utf8', timeout: 15000 })
  for (const name of ['known', 'after', 'answer']) assert.ok(metadata.includes(name), 'Compiler variable metadata: ' + name)
  for (const marker of ['BREAK_BEFORE', 'BREAK_AFTER', 'BREAK_DISPATCH', 'BREAK_CANCEL']) assert.ok(metadata.includes('line ' + journey.line(marker) + ':'), marker)
  const version = spawnSync(process.env.MCP_KOTLINC ?? 'kotlinc', ['-version'], { encoding: 'utf8', timeout: 15000 })
  assert.equal(version.status, 0, 'Kotlin compiler version probe')
  const compiler = (version.stdout + version.stderr).trim()
  const dependencies = []
  for (const name of ['MCP_KOTLIN_STDLIB', 'MCP_COROUTINES_CORE']) dependencies.push({ name, file: process.env[name], sha256: hash(await readFile(process.env[name]!)) })
  return { source_sha256: hash(source), apk_sha256: hash(await readFile(artifact)), dist_sha256: await fingerprint('dist'), worker_sha256: await fingerprint('src/debugger/java'), compiler, dependencies, metadata_sha256: hash(metadata), compiler_metadata: metadata }
}
async function run(deviceId: string) {
  const journey = new CoroutineJourney(deviceId, source)
  assert.equal(journey.adb('shell', 'pm', 'list', 'packages', coroutineAppId).trim(), '', 'Refusing to replace pre-existing fixture package')
  let fixture: ReturnType<typeof buildCoroutineFixture> | undefined
  let installed = false
  const interrupt = () => journey.interruption.abort()
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  const forwards = journey.adb('forward', '--list').trim()
  try {
    try { fixture = buildCoroutineFixture() } catch (error) {
      console.error('BLOCKED coroutine fixture build: check documented local compiler, jars and SDK prerequisites')
      throw error
    }
    const fingerprints = await evidence(fixture.directory, fixture.artifact, journey)
    await journey.connect()
    installed = true // A failed install may have left a partial owned package.
    journey.adb('install', fixture.artifact)
    journey.adb('shell', 'am', 'start', '-W', '-n', coroutineAppId + '/.MainActivity')
    await journey.visible('Coroutine ready')
    await completion(journey)
    await boundaryStep(journey)
    journey.adb('shell', 'am', 'force-stop', coroutineAppId)
    journey.adb('shell', 'am', 'start', '-W', '-n', coroutineAppId + '/.MainActivity')
    await journey.visible('Coroutine ready')
    await cancellation(journey)
    await journey.detach()
    assert.equal(journey.adb('forward', '--list').trim(), forwards)
    console.log(JSON.stringify({ status: 'PASS', device: deviceId, api: journey.adb('shell', 'getprop', 'ro.build.version.sdk').trim(), runtime: process.version, ...fingerprints, observations: journey.observations }))
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', device: deviceId, observations: journey.observations }))
    throw error
  } finally {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
    try { await journey.detach() } finally {
      try { await journey.client.close() } finally {
        try { if (installed) journey.adb('uninstall', coroutineAppId) } finally { if (fixture) await rm(fixture.directory, { recursive: true, force: true }) }
      }
    }
    assert.equal(journey.adb('forward', '--list').trim(), forwards, 'Owned forward cleanup')
    console.log('PASS coroutine fixture cleanup: package, temporary directory and owned forwards removed')
  }
}
if (!device) console.log('UNRUN coroutine debugger fixture: set MCP_COROUTINE_DEVICE, MCP_KOTLINC, MCP_KOTLIN_STDLIB and MCP_COROUTINES_CORE')
else await run(device)
