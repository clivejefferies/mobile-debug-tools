import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { buildBridge } from '../../../fixtures/ui-tree-bridge/build.js'
import { buildFixture } from '../../../fixtures/latency-journey-app/build.js'
import { summarize } from '../latency/report.js'

const deviceId = process.env.LATENCY_DEVICE_ID ?? ''
if (!deviceId) throw new Error('Set LATENCY_DEVICE_ID to one Android emulator')
const bridgePackage = 'dev.mobiledebugmcp.treebridge'
const fixturePackage = 'dev.mobiledebugmcp.latencyfixture'
const hostPort = 39020
const devicePort = 39019
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const elapsedMs = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6
const adb = (...args: string[]) => execFileSync('adb', ['-s', deviceId!, ...args], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function install(apk: string, appId: string) {
  try { adb('install', '-r', apk) }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) throw error
    adb('uninstall', appId)
    adb('install', '-r', apk)
  }
}

function nodes(xml: string): Array<Record<string, string>> {
  const tree = parser.parse(xml)
  const result: Array<Record<string, string>> = []
  const visit = (item: any) => {
    if (!item) return
    if (Array.isArray(item)) return item.forEach(visit)
    if (item['@_class']) result.push(item)
    visit(item.node)
  }
  visit(tree.hierarchy)
  return result
}

function bridgeRead(): Promise<{ xml: string; elapsed_ms: number; started_ns: bigint }> {
  const started_ns = process.hrtime.bigint()
  return new Promise((resolve, reject) => {
    let output = ''
    const socket = connect(hostPort, '127.0.0.1', () => socket.write('TREE\n'))
    socket.setTimeout(10000, () => socket.destroy(new Error('Bridge read timed out')))
    socket.on('data', (chunk) => { output += chunk.toString() })
    socket.on('error', reject)
    socket.on('end', () => {
      if (!output.startsWith('OK\n') || !output.includes('<hierarchy')) return reject(new Error(`Bridge response failed: ${output.slice(0, 80)}`))
      resolve({ xml: output.slice(3), elapsed_ms: elapsedMs(started_ns), started_ns })
    })
  })
}

async function readyBridge() {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try { return await bridgeRead() } catch { await sleep(100) }
  }
  throw new Error('Bridge did not become ready')
}

async function stopBridge() {
  await new Promise<void>((resolve, reject) => {
    const socket = connect(hostPort, '127.0.0.1', () => socket.write('STOP\n'))
    socket.setTimeout(5000, () => socket.destroy(new Error('Bridge stop timed out')))
    socket.on('error', reject)
    socket.on('data', (chunk) => {
      if (chunk.toString().startsWith('OK\n')) {
        socket.destroy()
        resolve()
      }
    })
  })
}

async function main() {
  const bridgeApk = buildBridge()
  const fixtureApk = buildFixture()
  install(bridgeApk, bridgePackage)
  install(fixtureApk, fixturePackage)
  const runId = randomUUID()
  let releaseResponse!: () => void
  let requestSeen!: () => void
  let responseSentNs = 0n
  const requestPromise = new Promise<void>((resolve) => { requestSeen = resolve })
  const releasePromise = new Promise<void>((resolve) => { releaseResponse = resolve })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== '/data' || url.searchParams.get('run_id') !== runId) return response.writeHead(404).end()
    requestSeen()
    await releasePromise
    await sleep(100)
    responseSentNs = process.hrtime.bigint()
    response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(`${runId}|value-${runId}`)
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind')
  const instrumentation: ChildProcess = spawn('adb', ['-s', deviceId, 'shell', 'am', 'instrument', '-w', `${bridgePackage}/.TreeInstrumentation`], { stdio: ['ignore', 'pipe', 'pipe'] })
  let bridgeStarted = false
  let forwarded = false
  try {
    adb('forward', `tcp:${hostPort}`, `tcp:${devicePort}`)
    forwarded = true
    await readyBridge()
    bridgeStarted = true
    adb('shell', 'am', 'force-stop', fixturePackage)
    adb('shell', 'am', 'start', '-n', `${fixturePackage}/.MainActivity`, '--ez', 'silentTimer', 'true')
    const initialDeadline = Date.now() + 5000
    let initialTimer = false
    while (Date.now() < initialDeadline) {
      initialTimer = nodes((await bridgeRead()).xml).some((node) => node['@_content-desc'] === 'silent timer 0:00')
      if (initialTimer) break
      await sleep(50)
    }
    if (!initialTimer) throw new Error('Bridge did not observe the initial silent timer')
    await sleep(2300)
    const updatedTimer = nodes((await bridgeRead()).xml).some((node) => node['@_content-desc'] === 'silent timer 0:01')
    if (!updatedTimer) throw new Error('Bridge reused a cached timer node after a visible update without an accessibility event')
    adb('shell', 'am', 'force-stop', fixturePackage)
    adb('shell', 'pm', 'clear', fixturePackage)
    adb('shell', 'am', 'start', '-n', `${fixturePackage}/.MainActivity`, '--es', 'networkBaseUrl', `http://10.0.2.2:${address.port}`, '--es', 'networkRunId', runId)
    await Promise.race([requestPromise, sleep(10000).then(() => { throw new Error('Fixture request timed out') })])
    const loadingDeadline = Date.now() + 10000
    let loadingOnly = false
    while (Date.now() < loadingDeadline) {
      const tree = nodes((await bridgeRead()).xml)
      loadingOnly = tree.some((node) => node['@_content-desc'] === 'loading') && !tree.some((node) => node['@_content-desc'] === 'ready' || node['@_content-desc'] === 'value')
      if (loadingOnly) break
      await sleep(50)
    }
    if (!loadingOnly) throw new Error('Bridge did not observe loading-only state')
    releaseResponse()
    while (!responseSentNs) await sleep(10)
    const readyDeadline = Date.now() + 10000
    let readyRead: Awaited<ReturnType<typeof bridgeRead>> | undefined
    while (Date.now() < readyDeadline) {
      const read = await bridgeRead()
      const tree = nodes(read.xml)
      if (tree.some((node) => node['@_content-desc'] === 'ready') && tree.some((node) => node['@_content-desc'] === 'value' && node['@_text'] === `value-${runId}`)) {
        readyRead = read
        break
      }
      await sleep(50)
    }
    if (!readyRead || readyRead.started_ns <= responseSentNs) throw new Error('Bridge ready/value assertion was not based on a post-response read')
    const bridgeSamples = []
    for (let index = 0; index < 10; index++) bridgeSamples.push(await bridgeRead())
    await stopBridge()
    bridgeStarted = false
    if (instrumentation.exitCode === null) await new Promise<void>((resolve) => instrumentation.once('close', () => resolve()))
    adb('forward', '--remove', `tcp:${hostPort}`)
    forwarded = false
    const legacySamples: Array<{ xml: string; elapsed_ms: number }> = []
    for (let index = 0; index < 10; index++) {
      const started = process.hrtime.bigint()
      // Android may still be releasing the instrumentation accessibility connection.
      for (let retry = 0; ; retry++) {
        try { adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml'); break }
        catch (error) {
          if (retry === 2) throw error
          await sleep(500)
        }
      }
      const xml = adb('shell', 'cat', '/sdcard/ui.xml')
      legacySamples.push({ xml, elapsed_ms: elapsedMs(started) })
    }
    const bridgeNodes = nodes(bridgeSamples[0].xml)
    const legacyNodes = nodes(legacySamples[0].xml)
    const countIdentifiers = (items: Array<Record<string, string>>) => items.filter((node) => node['@_resource-id'] || node['@_content-desc']).length
    const report = {
      platform: 'android', device_id: '[redacted]', fixture: 'latency-journey-app',
      network_freshness_passed: true,
      silent_timer_freshness_passed: true,
      bridge: { samples: summarize(bridgeSamples.map((sample) => sample.elapsed_ms)), node_count: bridgeNodes.length, identified_nodes: countIdentifiers(bridgeNodes) },
      legacy: { samples: summarize(legacySamples.map((sample) => sample.elapsed_ms)), node_count: legacyNodes.length, identified_nodes: countIdentifiers(legacyNodes) }
    }
    const output = path.resolve('docs/benchmarks/ui-tree-performance/bridge-probe.json')
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally {
    if (bridgeStarted) await stopBridge().catch(() => instrumentation.kill())
    if (forwarded) { try { adb('forward', '--remove', `tcp:${hostPort}`) } catch { /* Best-effort cleanup. */ } }
    if (!instrumentation.killed && instrumentation.exitCode === null) instrumentation.kill()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
