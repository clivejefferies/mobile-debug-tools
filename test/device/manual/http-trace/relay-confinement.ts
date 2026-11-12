import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createConnection, createServer, type Socket } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { buildRelay } from '../../../fixtures/http-trace-app/build-relay.js'
import { HttpTraceRelay } from '../../../../src/observe/http-trace/relay.js'
import { execAdb, getAdbArgs, getAdbCmd, spawnAdb } from '../../../../src/utils/android/commands.js'

const timeout = 8000
async function assertEmulator(device: string) {
  assert.match(device, /^emulator-\d+$/)
  for (const property of ['ro.kernel.qemu', 'sys.boot_completed']) {
    assert.equal(await execAdb(['shell', 'getprop', property], device, { timeout }), '1')
  }
}

async function assertGuestClosed(device: string, address: string, port: number) {
  const result = await spawnAdb(['shell', 'toybox', 'nc', '-z', '-w', '2', address, String(port)], device, { timeout })
  assert.equal(result.code, 1, `${device}:${address} unexpectedly connected: ${result.stderr}`)
  assert.match(result.stderr, /Connection refused|timed out|Network is unreachable|No route to host/)
}

async function assertHostClosed(address: string, port: number) {
  const connection = createConnection(port, address)
  try {
    await assert.rejects(once(connection, 'connect', { signal: AbortSignal.timeout(2500) }), { code: 'ECONNREFUSED' })
  } finally {
    connection.destroy()
  }
}

async function checkConfinement(target: string, other: string, port: number) {
  const interfaces = await execAdb(['shell', 'ip', '-4', '-o', 'addr', 'show', 'scope', 'global'], target, { timeout })
  const guest = [...interfaces.matchAll(/\binet (\d+\.\d+\.\d+\.\d+)\//g)].map(match => match[1])
  const host = Object.values(networkInterfaces()).flat().flatMap(entry =>
    entry?.family === 'IPv4' && !entry.internal ? [entry.address] : [])
  assert(guest.length && host.length)
  await Promise.all([
    ...new Set(['127.0.0.1', '10.0.2.2', ...guest]),
  ].map(address => assertGuestClosed(other, address, port)))
  await Promise.all(['127.0.0.1', ...host].map(address => assertHostClosed(address, port)))
}

function respond(socket: Socket, waiting: Map<string, Socket>) {
  socket.on('error', () => socket.destroy())
  socket.setTimeout(timeout, () => socket.destroy())
  socket.once('data', (data: Buffer) => {
    const message = data.toString().trim()
    if (message === 'hold') {
      socket.write('held\n')
      return
    }
    if (message === 'bulk') {
      socket.end(Buffer.alloc(256 * 1024, 1))
      return
    }
    waiting.set(message, socket)
    if (waiting.has('one') && waiting.has('two')) {
      for (const [value, connection] of waiting) connection.end(`reply-${value}\n`)
      waiting.clear()
    }
  })
}

async function request(target: string, port: number, value: string) {
  const command = `(echo ${value}; sleep 2) | toybox nc -w 2 -W 4 127.0.0.1 ${port}`
  assert.equal(await execAdb(['shell', command], target, { timeout }), `reply-${value}`)
}

async function probe(target: string, other: string, guest: string, socketPath: string) {
  const child = spawn(getAdbCmd(), getAdbArgs([
    'shell', '-T', `CLASSPATH=${guest}/classes.dex exec app_process /system/bin HttpTraceRelay`,
  ], target), { stdio: ['pipe', 'pipe', 'inherit'] })
  const exit = once(child, 'close')
  const bridge = new HttpTraceRelay(child.stdout, child.stdin, socketPath)
  const closed = bridge.closed.then(() => undefined, (error: unknown) => error)
  try {
    const port = await Promise.race([
      bridge.port,
      delay(timeout, undefined, { ref: false }).then(() => { throw new Error('Relay start timed out') }),
    ])
    const listener = await execAdb(['shell', `toybox netstat -ltn | grep ":${port} " || true`], target, { timeout })
    assert.match(listener, new RegExp(`127\\.0\\.0\\.1:${port}\\s.*LISTEN`),
      `No loopback listener on ${port}, ADB exit status ${child.exitCode}`)
    await checkConfinement(target, other, port)
    await Promise.all([request(target, port, 'one'), request(target, port, 'two')])
    const bulk = `(echo bulk; sleep 2) | toybox nc -w 2 -W 4 127.0.0.1 ${port} | toybox wc -c`
    assert.equal(Number(await execAdb(['shell', bulk], target, { timeout })), 256 * 1024)
    const hold = spawn(getAdbCmd(), getAdbArgs([
      'shell', '-T', `toybox nc -w 2 -W 8 127.0.0.1 ${port}`,
    ], target), { timeout, stdio: ['pipe', 'pipe', 'ignore'] })
    const holdClosed = once(hold, 'close')
    hold.stdin.on('error', () => {})
    hold.stdin.write('hold\n')
    try {
      const [received] = await once(hold.stdout, 'data', { signal: AbortSignal.timeout(timeout) })
      assert.equal(String(received).trim(), 'held')
      child.kill('SIGKILL')
      await exit
      await holdClosed
      await assertGuestClosed(target, '127.0.0.1', port)
      console.log(`PASS relay isolation, overlapping requests, 256 KiB transfer and disconnect cleanup on ${target} and ${other}`)
    } finally {
      hold.kill()
    }
  } finally {
    bridge.close()
    child.kill('SIGKILL')
    await exit
    const error = await closed
    if (error) throw error
  }
}

async function main() {
  const target = process.env.ANDROID_TRACE_TARGET
  const other = process.env.ANDROID_TRACE_OTHER
  assert(target && other && target !== other, 'Choose two distinct emulators')
  await Promise.all([assertEmulator(target), assertEmulator(other)])
  const directory = await mkdtemp('/tmp/mdm-trace-relay-')
  const socketPath = join(directory, 'proxy.sock')
  const waiting = new Map<string, Socket>()
  const server = createServer(socket => respond(socket, waiting))
  let guest: string | undefined
  try {
    const dex = buildRelay(directory)
    const path = await execAdb(['shell', 'mktemp', '-d', '/data/local/tmp/mdmtrace.XXXXXX'], target, { timeout })
    assert.match(path, /^\/data\/local\/tmp\/mdmtrace\.[A-Za-z0-9]+$/)
    guest = path
    await execAdb(['push', dex, `${guest}/classes.dex`], target, { timeout })
    await execAdb(['shell', 'chmod', '400', `${guest}/classes.dex`], target, { timeout })
    await chmod(directory, 0o700)
    server.listen(socketPath)
    await once(server, 'listening')
    await probe(target, other, guest, socketPath)
  } finally {
    try {
      if (guest) await execAdb(['shell', 'rm', '-rf', guest], target, { timeout })
    } finally {
      server.close()
      await rm(directory, { recursive: true, force: true })
    }
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
