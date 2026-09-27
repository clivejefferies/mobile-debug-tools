import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildFixture } from '../../../fixtures/latency-journey-app/build.js'
import { summarize } from '../latency/report.js'

const baselineRoot = process.env.UI_TREE_BASELINE_ROOT && path.resolve(process.env.UI_TREE_BASELINE_ROOT)
const candidateRoot = process.env.UI_TREE_CANDIDATE_ROOT && path.resolve(process.env.UI_TREE_CANDIDATE_ROOT)
const baselineOnly = process.argv.includes('--baseline-only')
const smokeOnly = process.argv.includes('--smoke')
const iterations = smokeOnly ? 1 : 13
const deviceId = process.env.LATENCY_DEVICE_ID
if (!baselineRoot || (!baselineOnly && !candidateRoot) || !deviceId) throw new Error('Set UI_TREE_BASELINE_ROOT and LATENCY_DEVICE_ID; paired runs also require UI_TREE_CANDIDATE_ROOT')
if (!baselineOnly && baselineRoot === candidateRoot) throw new Error('Baseline and candidate roots must be different')

const appId = 'dev.mobiledebugmcp.latencyfixture'
const activity = `${appId}/.MainActivity`
const adb = (...args: string[]) => execFileSync('adb', ['-s', deviceId!, ...args], { encoding: 'utf8', timeout: 30000 }).trim()
const monotonicNs = () => process.hrtime.bigint().toString()
const elapsedMs = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6
const selector = (accessibility_id: string) => ({ accessibility_id })
const journeySteps: Record<string, any>[] = [{ id: 'launch', type: 'start_app', appId }]
const staticFlow = [
  ['saved-session', 'idle-detail'], ['activate', 'active-detail'], ['home', 'home-screen'],
  ['saved-session', 'active-detail'], ['deactivate', 'idle-detail'], ['stop', 'stopped']
]
staticFlow.forEach(([target, expected], index) => {
  journeySteps.push({ id: `tap-${index}`, type: 'tap', selector: selector(target), waitFor: { condition: 'clickable', timeoutMs: 10000, pollIntervalMs: 100 } })
  journeySteps.push({ id: `assert-${index}`, type: 'assert', assertion: { kind: 'element_visible', selector: selector(expected) }, timeoutMs: 10000, pollIntervalMs: 100 })
})

interface MetricEvent { event?: string; type?: string; host_monotonic_ns?: string; [key: string]: unknown }
interface HarnessClient { client: Client; events: MetricEvent[]; close: () => Promise<void> }

function validateRoot(root: string) {
  const serverPath = path.join(root, 'dist/server.js')
  const packagePath = path.join(root, 'package.json')
  if (!readFileSync(packagePath, 'utf8') || !readFileSync(serverPath, 'utf8')) throw new Error(`Missing built server or package metadata in ${root}`)
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  if (status) throw new Error(`Benchmark root must be clean before device reset: ${root}`)
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), version: JSON.parse(readFileSync(packagePath, 'utf8')).version }
}

function safeFailure(error: unknown) {
  if (!(error instanceof Error)) return 'unknown_error'
  const safePrefixes = [
    'run_journey failed (',
    'find_element failed (',
    'get_ui_tree failed (',
    'Static journey returned success=',
    'Network fixture did not expose loading-only state for ',
    'Network fixture never exposed ready/value for ',
    'Network assertion used a tree read started before the response for ',
    'Fixture request timed out for ',
    'Fixture response was not sent for '
  ]
  return safePrefixes.some((prefix) => error.message.startsWith(prefix)) ? error.message : error.name
}

async function startClient(root: string): Promise<HarnessClient> {
  const events: MetricEvent[] = []
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, 'dist/server.js')],
    cwd: root,
    env: { ...process.env, MOBILE_DEBUG_MCP_UI_TREE_METRICS: '1' },
    stderr: 'pipe'
  })
  let pending = ''
  transport.stderr?.on('data', (chunk) => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        if (event.event === 'ui_tree_metric') events.push(event)
      } catch { /* Server diagnostics are not benchmark measurement records. */ }
    }
  })
  const client = new Client({ name: 'ui-tree-performance', version: '1.0' })
  await client.connect(transport)
  return { client, events, close: () => client.close() }
}

async function call(harness: HarnessClient, name: string, args: Record<string, unknown>) {
  const startedNs = monotonicNs()
  const eventsStart = harness.events.length
  const started = process.hrtime.bigint()
  const response: any = await harness.client.callTool({ name, arguments: { platform: 'android', deviceId, ...args } }, undefined, { timeout: 300000 })
  const elapsed = elapsedMs(started)
  const text = response.content?.find((item: any) => item.type === 'text')?.text
  let data: any
  try { data = JSON.parse(text ?? '{}') } catch { throw new Error(`${name} returned a non-JSON response`) }
  if (response.isError || data.error || data.success === false || data.status === 'timeout') {
    const failedStep = Array.isArray(args.steps) ? args.steps.find((step: any) => step.id === data.stopped_at_step_id) : undefined
    const selectorId = failedStep?.selector?.accessibility_id ?? failedStep?.assertion?.selector?.accessibility_id
    const stepDetail = failedStep ? ` step=${failedStep.id}${selectorId ? ` selector=${selectorId}` : ''}` : ''
    throw new Error(`${name} failed (${data.failure_code ?? data.error?.code ?? 'tool_error'})${stepDetail}`)
  }
  return { data, elapsed, started_ns: startedNs, events: harness.events.slice(eventsStart) }
}

function resetFixture(apk: string) {
  adb('shell', 'am', 'force-stop', appId)
  try { adb('shell', 'pm', 'clear', appId) } catch { /* First install has no app data. */ }
  try {
    adb('install', '-r', apk)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) throw error
    adb('uninstall', appId)
    adb('install', '-r', apk)
  }
}

function containsElement(tree: any, id: string) {
  return Array.isArray(tree?.elements) && tree.elements.some((element: any) => element.contentDescription === id || element.resourceId === id || element.text === id)
}

async function runStatic(harness: HarnessClient, apk: string) {
  resetFixture(apk)
  adb('shell', 'am', 'start', '-n', activity)
  const diagnostic = await call(harness, 'find_element', { query: 'saved-session', exact: true, timeoutMs: 10000 })
  adb('shell', 'am', 'force-stop', appId)
  adb('shell', 'pm', 'clear', appId)
  const result = await call(harness, 'run_journey', {
    responseMode: 'compact',
    defaults: { verificationMode: 'light', actionTimeoutMs: 30000, verificationTimeoutMs: 3000 },
    steps: journeySteps
  })
  if (result.data.success !== true) throw new Error(`Static journey returned success=${result.data.success}`)
  return {
    elapsed_ms: result.elapsed,
    started_ns: result.started_ns,
    find_element_diagnostic: { elapsed_ms: diagnostic.elapsed, found: diagnostic.data.found },
    request_sequence: [
      { tool: 'find_element', phase: 'diagnostic' },
      { tool: 'run_journey', steps: journeySteps.map((step) => ({ id: step.id, type: step.type })) }
    ],
    events: [...diagnostic.events, ...result.events],
    steps: result.data.steps.map((step: any) => ({ id: step.id, status: step.status, success: step.success, failure_code: step.result?.failure_code }))
  }
}

interface ControlledServer { server: Server; url: string; waitForRequest: () => Promise<void>; release: () => Promise<string> }

async function startControlledServer(delayMs: number, runId: string): Promise<ControlledServer> {
  let requestSeen!: () => void
  let releaseResponse!: () => void
  let sendNs = ''
  const requestPromise = new Promise<void>((resolve) => { requestSeen = resolve })
  const releasePromise = new Promise<void>((resolve) => { releaseResponse = resolve })
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    if (requestUrl.pathname !== '/data' || requestUrl.searchParams.get('run_id') !== runId) {
      response.writeHead(404).end()
      return
    }
    requestSeen()
    await releasePromise
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    sendNs = monotonicNs()
    response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(`${runId}|value-${runId}`)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not bind local fixture server')
  const waitForRequest = () => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Fixture request timed out for ${runId}`)), 10000)
    requestPromise.then(() => { clearTimeout(timer); resolve() })
  })
  return {
    server,
    url: `http://10.0.2.2:${address.port}`,
    waitForRequest,
    release: async () => {
      await waitForRequest()
      releaseResponse()
      const deadline = Date.now() + delayMs + 15000
      while (!sendNs && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
      if (!sendNs) throw new Error(`Fixture response was not sent for ${runId}`)
      return sendNs
    }
  }
}

async function runNetwork(harness: HarnessClient, apk: string, delayMs: number, runId: string) {
  resetFixture(apk)
  const server = await startControlledServer(delayMs, runId)
  const allEventsStart = harness.events.length
  try {
    adb('shell', 'am', 'start', '-n', activity, '--es', 'networkBaseUrl', server.url, '--es', 'networkRunId', runId)
    const started = process.hrtime.bigint()
    const initial = await call(harness, 'get_ui_tree', { _metricsStepId: `network-loading-${runId}` })
    if (!containsElement(initial.data, 'loading') || containsElement(initial.data, 'ready') || containsElement(initial.data, 'value')) {
      throw new Error(`Network fixture did not expose loading-only state for ${runId}`)
    }
    const sendNs = await server.release()
    const deadline = Date.now() + 15000
    let finalTree: any = null
    let finalReadEvents: MetricEvent[] = []
    let finalReadStartNs = ''
    while (Date.now() < deadline) {
      const observation = await call(harness, 'get_ui_tree', { _metricsStepId: `network-post-response-${runId}` })
      if (containsElement(observation.data, 'ready') && observation.data.elements?.some((element: any) => element.contentDescription === 'value' && element.text === `value-${runId}`)) {
        finalTree = observation.data
        finalReadEvents = observation.events
        finalReadStartNs = observation.started_ns
        break
      }
    }
    if (!finalTree) throw new Error(`Network fixture never exposed ready/value for ${runId}`)
    const physicalStarts = finalReadEvents.filter((event) => event.type === 'physical_read_started')
    if (!physicalStarts.length || physicalStarts.some((event) => BigInt(String(event.host_monotonic_ns)) <= BigInt(sendNs))) {
      throw new Error(`Network assertion used a tree read started before the response for ${runId}`)
    }
    return {
      elapsed_ms: elapsedMs(started),
      request_started_ns: initial.started_ns,
      response_sent_ns: sendNs,
      assertion_request_started_ns: finalReadStartNs,
      request_sequence: [
        { tool: 'get_ui_tree', step_id: `network-loading-${runId}` },
        { tool: 'get_ui_tree', step_id: `network-post-response-${runId}`, attempts: finalReadEvents.filter((event) => event.type === 'physical_read_started').length }
      ],
      events: harness.events.slice(allEventsStart),
      assertion_read_events: finalReadEvents
    }
  } finally {
    server.server.closeAllConnections()
    await new Promise<void>((resolve) => server.server.close(() => resolve()))
  }
}

async function main() {
  const roots: Record<string, { commit: string; version: string }> = { baseline: validateRoot(baselineRoot!) }
  if (!baselineOnly) roots.candidate = validateRoot(candidateRoot!)
  const apk = buildFixture()
  const fixtureHash = createHash('sha256').update(readFileSync(apk)).digest('hex')
  const baselineClient = await startClient(baselineRoot!)
  const clients: Record<'baseline' | 'candidate', HarnessClient | undefined> = { baseline: baselineClient, candidate: undefined }
  if (!baselineOnly) {
    try { clients.candidate = await startClient(candidateRoot!) }
    catch (error) { await baselineClient.close(); throw error }
  }
  const raw: any[] = []
  try {
    const runModes = async (kind: 'static' | 'network', delayMs?: number) => {
      for (let iteration = 0; iteration < iterations; iteration++) {
        const order: Array<'baseline' | 'candidate'> = baselineOnly ? ['baseline'] : iteration % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline']
        for (const mode of order) {
          const warmup = !smokeOnly && iteration < 3
          const runId = `${kind}-${delayMs ?? 0}-${iteration}-${mode}-${Date.now()}`
          const harness = clients[mode]
          if (!harness) throw new Error(`Missing ${mode} MCP client`)
          const eventsStart = harness.events.length
          try {
            const result = kind === 'static'
              ? await runStatic(harness, apk)
              : await runNetwork(harness, apk, delayMs!, runId)
            raw.push({ mode, flow: kind, delay_ms: delayMs, iteration, warmup, success: true, ...result })
            console.log(`${kind} ${delayMs ?? ''} ${mode} ${iteration + 1}/${iterations} PASS`)
          } catch (error) {
            const failure = safeFailure(error)
            raw.push({ mode, flow: kind, delay_ms: delayMs, iteration, warmup, success: false, failure, events: harness.events.slice(eventsStart) })
            console.error(`${kind} ${delayMs ?? ''} ${mode} ${iteration + 1}/${iterations} FAIL: ${failure}`)
          }
        }
      }
    }
    await runModes('static')
    await runModes('network', 100)
    await runModes('network', 1500)
  } finally {
    await Promise.all(Object.values(clients).filter((harness): harness is HarnessClient => !!harness).map((harness) => harness.close()))
  }

  if (smokeOnly) {
    if (raw.some((run) => !run.success)) process.exitCode = 1
    return
  }

  const summarizeMode = (mode: 'baseline' | 'candidate', flow: string, delayMs?: number) => {
    const measured = raw.filter((run) => run.mode === mode && run.flow === flow && run.delay_ms === delayMs && !run.warmup)
    const successful = measured.filter((run) => run.success)
    const actionSamples = successful.flatMap((run) => run.events.filter((event: MetricEvent) => event.type === 'action_observation'))
    const acquisitions = successful.flatMap((run) => run.events.filter((event: MetricEvent) => event.type === 'acquisition_completed'))
    const stageSamples = successful.flatMap((run) => run.events.filter((event: MetricEvent) => event.type === 'stage'))
    const allEvents = measured.flatMap((run) => run.events ?? []) as MetricEvent[]
    const groupKeys = [...new Set(allEvents.flatMap((event) => {
      if (event.type === 'physical_read_started' || event.type === 'stage' || event.type === 'acquisition_completed') return [`${event.step_id ?? 'unattributed'}|${event.purpose ?? 'unspecified'}`]
      if (event.type === 'observation_consumer') return [`${event.consumer_step_id ?? 'unattributed'}|${event.consumer_purpose ?? 'unspecified'}`]
      return []
    }))]
    const acquisitionBreakdown = Object.fromEntries(groupKeys.map((key) => {
      const [stepId, purpose] = key.split('|')
      const events = allEvents.filter((event) => (event.step_id ?? 'unattributed') === stepId && (event.purpose ?? 'unspecified') === purpose)
      const startedReads = events.filter((event) => event.type === 'physical_read_started')
      const completedReads = events.filter((event) => event.type === 'physical_read_completed')
      const invalidParseAttempts = events.filter((event) => event.type === 'stage' && event.stage === 'parse_ms' && event.success === false)
      const failedReadAttempts = new Set([
        ...completedReads.filter((event) => event.success === false).map((event) => `${event.acquisition_id}|${event.attempt_index}`),
        ...invalidParseAttempts.map((event) => `${event.acquisition_id}|${event.attempt_index}`)
      ])
      const stageGroups = Object.fromEntries([...new Set(events.filter((event) => event.type === 'stage').map((event) => String(event.stage)))].map((stage) => [stage, summarize(events.filter((event) => event.type === 'stage' && event.stage === stage && typeof event.elapsed_ms === 'number').map((event) => Number(event.elapsed_ms)))]))
      const reused = allEvents.filter((event) => event.type === 'observation_consumer' && (event.consumer_step_id ?? 'unattributed') === stepId && (event.consumer_purpose ?? 'unspecified') === purpose).reduce((sum, event) => sum + Number(event.reused_observations ?? 0), 0)
      return [key, {
        physical_tree_reads: startedReads.length,
        failed_tree_reads: failedReadAttempts.size,
        reused_observations: reused,
        tree_read_ms: summarize(completedReads.filter((event) => typeof event.elapsed_ms === 'number').map((event) => Number(event.elapsed_ms))),
        acquisition_ms: summarize(acquisitions.filter((event) => (event.step_id ?? 'unattributed') === stepId && (event.purpose ?? 'unspecified') === purpose).map((event) => Number(event.elapsed_ms))),
        stages_ms: stageGroups
      }]
    }))
    return {
      measured_attempts: measured.length,
      failures: measured.filter((run) => !run.success).length,
      end_to_end_ms: summarize(successful.map((run) => run.elapsed_ms)),
      action_observations: actionSamples,
      acquisitions,
      stage_samples: stageSamples,
      acquisition_breakdown_by_step_purpose: acquisitionBreakdown,
      target_resolution_ms: summarize(actionSamples.filter((event) => typeof event.target_resolution_ms === 'number').map((event) => Number(event.target_resolution_ms))),
      dispatch_ms: summarize(actionSamples.filter((event) => typeof event.dispatch_ms === 'number').map((event) => Number(event.dispatch_ms))),
      light_verification_elapsed_ms: summarize(actionSamples.filter((event) => typeof event.verification_elapsed_ms === 'number').map((event) => Number(event.verification_elapsed_ms))),
      light_verification_unavailable_count: actionSamples.filter((event) => event.verification_outcome === 'unavailable').length,
      find_element_ms: summarize(successful.filter((run) => typeof run.find_element_diagnostic?.elapsed_ms === 'number').map((run) => Number(run.find_element_diagnostic.elapsed_ms))),
      find_element_not_found_count: successful.filter((run) => run.find_element_diagnostic?.found !== true).length
    }
  }
  const modes: Record<string, any> = {
    baseline: { static: summarizeMode('baseline', 'static'), network_100ms: summarizeMode('baseline', 'network', 100), network_1500ms: summarizeMode('baseline', 'network', 1500) }
  }
  if (!baselineOnly) modes.candidate = { static: summarizeMode('candidate', 'static'), network_100ms: summarizeMode('candidate', 'network', 100), network_1500ms: summarizeMode('candidate', 'network', 1500) }
  const baselineSummary = modes.baseline as any
  const candidateSummary = modes.candidate as any
  const gates = baselineOnly ? undefined : {
    static_p50_improvement: !!baselineSummary.static.end_to_end_ms && !!candidateSummary.static.end_to_end_ms && candidateSummary.static.end_to_end_ms.p50 <= baselineSummary.static.end_to_end_ms.p50 * 0.85,
    static_p95_regression: !!baselineSummary.static.end_to_end_ms && !!candidateSummary.static.end_to_end_ms && candidateSummary.static.end_to_end_ms.p95 <= baselineSummary.static.end_to_end_ms.p95 * 1.05,
    network_100ms_p95_regression: !!baselineSummary.network_100ms.end_to_end_ms && !!candidateSummary.network_100ms.end_to_end_ms && candidateSummary.network_100ms.end_to_end_ms.p95 <= baselineSummary.network_100ms.end_to_end_ms.p95 * 1.05,
    network_1500ms_p95_regression: !!baselineSummary.network_1500ms.end_to_end_ms && !!candidateSummary.network_1500ms.end_to_end_ms && candidateSummary.network_1500ms.end_to_end_ms.p95 <= baselineSummary.network_1500ms.end_to_end_ms.p95 * 1.05,
    zero_measured_failures: !raw.some((run) => !run.warmup && !run.success)
  }
  const report = {
    created_at: new Date().toISOString(),
    fixture_sha256: fixtureHash,
    fixture_version: '1.0',
    device_id: '[redacted]',
    platform: 'android',
    model: adb('shell', 'getprop', 'ro.product.model'),
    os: adb('shell', 'getprop', 'ro.build.version.release'),
    api: adb('shell', 'getprop', 'ro.build.version.sdk'),
    emulator_image: adb('emu', 'avd', 'name').split('\n')[0].trim(),
    display_size: adb('shell', 'wm', 'size'),
    display_density: adb('shell', 'wm', 'density'),
    host: { platform: process.platform, arch: process.arch, node: process.version },
    command_timeout_ms: 30000,
    request_timeout_ms: 300000,
    warmup_runs_per_flow: 3,
    measured_runs_per_flow: 10,
    roots,
    modes,
    gates,
    raw
  }
  const environment = {
    model: report.model,
    os: report.os,
    api: report.api,
    emulator_image: report.emulator_image,
    display_size: report.display_size,
    display_density: report.display_density,
    host: report.host,
    command_timeout_ms: report.command_timeout_ms,
    request_timeout_ms: report.request_timeout_ms,
    warmup_runs_per_flow: report.warmup_runs_per_flow,
    measured_runs_per_flow: report.measured_runs_per_flow
  }
  const outputRoot = path.join(baselineOnly ? baselineRoot! : candidateRoot!, 'docs/benchmarks/ui-tree-performance')
  mkdirSync(outputRoot, { recursive: true })
  writeFileSync(path.join(outputRoot, 'baseline.json'), JSON.stringify({ commit: roots.baseline.commit, server_version: roots.baseline.version, fixture_sha256: fixtureHash, platform: report.platform, environment, modes: modes.baseline, raw: raw.filter((run) => run.mode === 'baseline') }, null, 2))
  if (!baselineOnly) {
    writeFileSync(path.join(outputRoot, 'comparison.json'), JSON.stringify(report, null, 2))
    writeFileSync(path.join(outputRoot, 'candidate.json'), JSON.stringify({ commit: roots.candidate.commit, server_version: roots.candidate.version, fixture_sha256: fixtureHash, platform: report.platform, environment, modes: modes.candidate, raw: raw.filter((run) => run.mode === 'candidate') }, null, 2))
    const rows = Object.entries(modes).flatMap(([mode, flows]: [string, any]) => Object.entries(flows).map(([flow, value]: [string, any]) => `| ${mode} | ${flow} | ${value.end_to_end_ms?.p50 ?? 'n/a'} | ${value.end_to_end_ms?.p95 ?? 'n/a'} | ${value.failures} |`))
    writeFileSync(path.join(outputRoot, 'comparison.md'), `# UI tree observation performance\n\nFixture SHA-256: ${fixtureHash}. Android ${report.os}, API ${report.api}. Three warm-ups and ten measured attempts per flow and mode. Failed attempts are visible in the JSON reports and excluded from percentiles.\n\n| Mode | Flow | p50 ms | p95 ms | Failures |\n|---|---|---:|---:|---:|\n${rows.join('\n')}\n\n| Acceptance gate | Result |\n|---|---|\n${Object.entries(gates!).map(([gate, passed]) => `| ${gate} | ${passed ? 'pass' : 'fail'} |`).join('\n')}\n\nRaw per-attempt records include acquisition and consumer events, response-send timestamps, and assertion-read timestamps. Device serials and UI contents are not recorded.\n`)
    if (Object.values(gates!).some((passed) => !passed)) process.exitCode = 1
  } else if (raw.some((run) => !run.warmup && !run.success)) {
    process.exitCode = 1
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
