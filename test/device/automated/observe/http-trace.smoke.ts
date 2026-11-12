import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildTraceFixture, socketTraceFixtureAppId, traceFixtureAppId } from '../../../fixtures/http-trace-app/build.js'
import { execAdb } from '../../../../src/utils/android/commands.js'

async function origin(directory: string, name: string) {
  const cert = join(directory, name + '.pem')
  const key = join(directory, name + '.key')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', key, '-out', cert],
  { stdio: 'ignore', timeout: 5000 })
  let requests = 0
  const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
    assert.equal(request.url?.split('?')[0], '/fixture')
    requests++
    response.end('owned upstream response')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    cert, port: (server.address() as AddressInfo).port, requests: () => requests,
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }),
  }
}

async function mcp(backend: string, cert: string) {
  const client = new Client({ name: 'http-trace-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath, args: [process.env.MCP_HTTP_TRACE_TEST_SERVER ?? 'dist/server.js'], stderr: 'pipe',
    env: { MCP_HTTP_TRACE_MOCKTTP_MODULE: backend, NODE_EXTRA_CA_CERTS: cert },
  })
  transport.stderr?.on('data', () => {})
  await client.connect(transport)
  return {
    client,
    async call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 35000 })
      assert(Array.isArray(result.content))
      const first = result.content[0]
      assert(first.type === 'text')
      return JSON.parse(first.text)
    },
  }
}

async function run() {
  const deviceId = process.env.ANDROID_TRACE_TARGET
  const backend = process.env.MCP_HTTP_TRACE_MOCKTTP_MODULE
  if (!deviceId || !backend || process.env.SKIP_DEVICE_TESTS === '1') {
    console.log('UNRUN HTTP trace fixture: set ANDROID_TRACE_TARGET and MCP_HTTP_TRACE_MOCKTTP_MODULE')
    return
  }
  assert.match(deviceId, /^emulator-\d+$/)
  const appId = traceFixtureAppId
  const adb = (args: string[]) => execAdb(args, deviceId, { timeout: 15000 })
  assert.equal(await adb(['shell', 'pm', 'list', 'packages', appId]), '')
  const directory = await mkdtemp('/tmp/mdm-ht-test-')
  const owned: Array<() => Promise<void>> = []
  const installed: string[] = []
  const fixtureDirectories: string[] = []
  try {
    const good = await origin(directory, 'good')
    owned.push(good.close)
    const bad = await origin(directory, 'bad')
    owned.push(bad.close)
    const fixture = buildTraceFixture()
    fixtureDirectories.push(fixture.directory)
    const server = await mcp(backend, good.cert)
    owned.push(() => server.client.close())
    const other = await mcp(backend, good.cert)
    owned.push(() => other.client.close())
    assert((await server.client.listTools()).tools.some(tool => tool.name === 'start_http_trace'))

    assert.equal((await server.call('start_http_trace', { deviceId: 'physical', allowedHosts: ['localhost'] })).error.code, 'INVALID_ARGUMENT')
    assert.equal((await server.call('start_http_trace', { deviceId, appId, allowedHosts: ['localhost'] })).error.code, 'HTTP_TRACE_APP_NOT_OPTED_IN')
    await adb(['install', fixture.artifact])
    installed.push(appId)
    await adb(['shell', 'am', 'start', '-W', '-n', `${appId}/.TraceActivity`])
    assert.equal(await adb(['shell', 'run-as', appId, 'cat', 'files/http-trace/version']), '1')
    const input = { deviceId, appId, allowedHosts: ['localhost'] }
    const start = await server.call('start_http_trace', input)
    assert.equal(start.readiness, 'listening', JSON.stringify(start))
    assert.equal(start.appConfigured, true)
    const traceId = start.traceId
    assert.equal((await server.call('start_http_trace', input)).error.code, 'HTTP_TRACE_CONFLICT')
    assert.equal((await other.call('start_http_trace', input)).error.code, 'HTTP_TRACE_CONFLICT')
    assert.equal((await other.call('read_http_trace', { traceId })).error.code, 'HTTP_TRACE_UNKNOWN')

    const request = (port: number) => adb(['shell', 'am', 'broadcast', '-a', `${appId}.REQUEST`,
      '-p', appId, '--ei', 'originPort', String(port)])
    assert.match(await request(good.port), /data="trace-status-200"/)
    assert.equal(good.requests(), 1)
    assert.match(await request(bad.port), /data="trace-status-502"/)
    assert.equal(bad.requests(), 0)

    let page = await server.call('read_http_trace', { traceId, pageSize: 1 })
    for (let attempt = 0; attempt < 10 && page.records?.length === 0; attempt++) {
      await delay(100)
      page = await server.call('read_http_trace', { traceId, pageSize: 1 })
    }
    assert.equal(page.readiness, 'exchange_observed', JSON.stringify(page))
    assert.equal(page.records.length, 1)
    assert.equal(page.records[0].host, 'localhost')
    assert.equal(page.records[0].status, 200)
    assert.equal(page.records[0].method, 'GET')
    assert.equal('url' in page.records[0], false)
    const failed = await server.call('read_http_trace', { traceId, cursor: page.nextCursor })
    assert.equal(failed.records[0].failure, 'upstream_transport', JSON.stringify(failed))
    const traceFile = `files/http-trace/${traceId}.json`
    await adb(['shell', 'run-as', appId, 'rm', traceFile])
    await adb(['shell', 'run-as', appId, 'mkdir', traceFile])
    assert.deepEqual(await server.call('stop_http_trace', { traceId }), { traceId, cleanedUp: false, reason: 'stopped' })
    await adb(['shell', 'run-as', appId, 'rmdir', traceFile])
    const stop = await server.call('stop_http_trace', { traceId })
    assert.equal(stop.cleanedUp, true)
    assert.deepEqual(await server.call('stop_http_trace', { traceId }), stop)
    assert.match(await request(good.port), /data="normal-route"/)
    const interrupted = await server.call('start_http_trace', input)
    assert.equal(interrupted.appConfigured, true)
    await server.client.close()
    assert.match(await request(good.port), /data="normal-route"/)

    const socketApp = socketTraceFixtureAppId
    assert.equal(await adb(['shell', 'pm', 'list', 'packages', socketApp]), '')
    const socketFixture = buildTraceFixture(true)
    fixtureDirectories.push(socketFixture.directory)
    await adb(['install', socketFixture.artifact])
    installed.push(socketApp)
    await adb(['shell', 'am', 'start', '-W', '-n', `${socketApp}/.TraceActivity`])
    const second = await other.call('start_http_trace', { ...input, appId: socketApp })
    assert.equal(second.appConfigured, true, JSON.stringify(second))
    const socketRequest = () => adb(['shell', 'am', 'broadcast', '-a', `${socketApp}.REQUEST`,
      '-p', socketApp, '--ei', 'originPort', String(good.port)])
    assert.match(await socketRequest(), /data="trace-status-200"/)
    assert.equal(good.requests(), 2)
    const secondPage = await other.call('read_http_trace', { traceId: second.traceId })
    assert.equal(secondPage.records[0].status, 200)
    assert.equal((await other.call('stop_http_trace', { traceId: second.traceId })).cleanedUp, true)
    assert.match(await socketRequest(), /data="normal-route"/)
    if (process.env.MCP_HTTP_TRACE_TEST_EXPIRY === '1') {
      const beforeStart = Date.now()
      const expiring = await other.call('start_http_trace', { ...input, appId: socketApp })
      assert.equal(expiring.appConfigured, true)
      assert(expiring.expiresAt >= beforeStart + 300000)
      assert.match(await socketRequest(), /data="trace-status-200"/)
      console.log('Waiting for the five-minute HTTP trace to expire')
      await delay(Math.max(0, expiring.expiresAt - Date.now()) + 500)
      const expired = await other.call('read_http_trace', { traceId: expiring.traceId })
      assert.equal(expired.error.code, 'HTTP_TRACE_EXPIRED')
      assert.match(await socketRequest(), /data="normal-route"/)
      await assert.rejects(adb(['shell', 'run-as', socketApp, 'test', '-e', `files/http-trace/${expiring.traceId}.json`]))
      assert.deepEqual(await other.call('stop_http_trace', { traceId: expiring.traceId }), {
        traceId: expiring.traceId, cleanedUp: true, reason: 'expired',
      })
      console.log('Five-minute HTTP trace expiry and cleanup passed')
    }
    console.log('HTTP trace MCP passed on both Android apps: setup, HTTPS, TLS rejection, redacted paging, session isolation and cleanup')
  } finally {
    const cleanup = await Promise.allSettled(owned.reverse().map(operation => operation()))
    const apps = await Promise.allSettled(installed.map(id => adb(['uninstall', id])))
    await Promise.all([directory, ...fixtureDirectories].map(path => rm(path, { recursive: true, force: true })))
    assert([...cleanup, ...apps].every(result => result.status === 'fulfilled'), 'Trace fixture cleanup failed')
  }
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
