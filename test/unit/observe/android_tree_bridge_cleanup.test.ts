import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readAndroidTreeFromBridge } from '../../../src/observe/android-tree-bridge.js'

async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-tree-bridge-'))
  const adbPath = path.join(directory, 'adb')
  const apkPath = path.join(directory, 'bridge.apk')
  const launchesPath = path.join(directory, 'launches')
  const getpropsPath = path.join(directory, 'getprops')
  const previous = new Map(['ADB_PATH', 'MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK', 'MCP_FAKE_BRIDGE_PORT', 'MCP_FAKE_BRIDGE_LAUNCHES', 'MCP_FAKE_BRIDGE_GETPROPS', 'MCP_FAKE_FORCE_STOP_FAIL', 'MCP_FAKE_SDK'].map((key) => [key, process.env[key]]))
  let invalidTree = false
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.once('data', (chunk) => {
      const command = chunk.toString().trim()
      socket.end(command === 'TREE'
        ? invalidTree ? 'ERROR null_root\n' : 'OK\n<hierarchy><node class="android.view.View" /></hierarchy>'
        : 'OK\n')
    })
  })
  writeFileSync(apkPath, '')
  writeFileSync(launchesPath, '')
  writeFileSync(getpropsPath, '')
  writeFileSync(adbPath, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2).join(' ')
if (args.includes('am instrument')) {
  fs.appendFileSync(process.env.MCP_FAKE_BRIDGE_LAUNCHES, 'launch\\n')
  setInterval(() => {}, 1000)
} else if (args.includes('am force-stop') && process.env.MCP_FAKE_FORCE_STOP_FAIL === '1') {
  process.exit(1)
} else if (args.includes('forward tcp:0')) {
  console.log(process.env.MCP_FAKE_BRIDGE_PORT)
} else if (args.includes('getprop ro.build.version.sdk')) {
  fs.appendFileSync(process.env.MCP_FAKE_BRIDGE_GETPROPS, 'getprop\\n')
  console.log(process.env.MCP_FAKE_SDK || '36')
}
`)
  chmodSync(adbPath, 0o755)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  process.env.ADB_PATH = adbPath
  process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK = apkPath
  process.env.MCP_FAKE_BRIDGE_PORT = String(address.port)
  process.env.MCP_FAKE_BRIDGE_LAUNCHES = launchesPath
  process.env.MCP_FAKE_BRIDGE_GETPROPS = getpropsPath
  try {
    assert.match(await readAndroidTreeFromBridge('test-device') ?? '', /<hierarchy>/)
    invalidTree = true
    process.env.MCP_FAKE_FORCE_STOP_FAIL = '1'
    await assert.rejects(() => readAndroidTreeFromBridge('test-device'), /BRIDGE_CLEANUP_UNCONFIRMED/)
    await assert.rejects(() => readAndroidTreeFromBridge('test-device'), /BRIDGE_CLEANUP_UNCONFIRMED/)
    assert.equal(readFileSync(launchesPath, 'utf8').trim().split('\n').length, 1, 'failed cleanup must block a second launch')
    invalidTree = false
    delete process.env.MCP_FAKE_FORCE_STOP_FAIL
    assert.match(await readAndroidTreeFromBridge('test-device') ?? '', /<hierarchy>/, 'successful cleanup allows relaunch')
    for (let attempt = 0; attempt < 20 && readFileSync(launchesPath, 'utf8').trim().split('\n').length < 2; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(readFileSync(launchesPath, 'utf8').trim().split('\n').length, 2)
    invalidTree = true
    assert.equal(await readAndroidTreeFromBridge('test-device'), null, 'clean shutdown permits legacy fallback')
    process.env.MCP_FAKE_SDK = '33'
    assert.equal(await readAndroidTreeFromBridge('old-device'), null, 'older Android versions use the legacy reader')
    assert.equal(await readAndroidTreeFromBridge('old-device'), null)
    assert.equal(readFileSync(getpropsPath, 'utf8').trim().split('\n').length, 2, 'supported and unsupported devices each probe SDK once')
    assert.equal(readFileSync(launchesPath, 'utf8').trim().split('\n').length, 2)
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
