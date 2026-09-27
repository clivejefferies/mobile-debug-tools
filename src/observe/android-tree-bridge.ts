import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import path from 'node:path'
import { execAdb, getAdbCmd } from '../utils/android/utils.js'
import { remainingBudget } from '../utils/operation-budget.js'

const packageName = 'dev.mobiledebugmcp.treebridge'
const component = `${packageName}/.TreeInstrumentation`
const devicePort = 39019

interface Bridge {
  deviceId: string
  hostPort: number
  child: ChildProcess
  closed: boolean
  childClosed: boolean
}

const active = new Map<string, Bridge>()
const starting = new Map<string, Promise<Bridge>>()
const stopping = new Map<string, Promise<void>>()

export function androidTreeBridgeEnabled(): boolean {
  return Boolean(process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK)
}

function configuredApk() {
  const configured = process.env.MOBILE_DEBUG_MCP_ANDROID_TREE_BRIDGE_APK
  if (!configured) return null
  const apk = path.resolve(configured)
  if (!existsSync(apk)) throw new Error(`Android UI tree bridge APK does not exist: ${apk}`)
  return apk
}

function unbudgetedAdb(deviceId: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(getAdbCmd(), ['-s', deviceId, ...args], { timeout: 5000 }, (error) => error ? reject(error) : resolve())
  })
}

function request(bridge: Bridge, command: 'PING' | 'TREE' | 'STOP', timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const socket = connect(bridge.hostPort, '127.0.0.1', () => socket.write(`${command}\n`))
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`Android UI tree bridge ${command} timed out`)))
    socket.on('data', (chunk) => {
      output += chunk.toString()
      if (command === 'STOP' && output.startsWith('OK\n')) {
        resolve(output)
        socket.destroy()
      }
    })
    socket.on('error', reject)
    socket.on('end', () => resolve(output))
  })
}

function waitForChildClose(bridge: Bridge, timeoutMs: number): Promise<void> {
  if (bridge.childClosed) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onClose = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(() => {
      bridge.child.off('close', onClose)
      reject(new Error('Android UI tree bridge child did not exit'))
    }, timeoutMs)
    bridge.child.once('close', onClose)
  })
}

async function stop(bridge: Bridge): Promise<void> {
  const pending = stopping.get(bridge.deviceId)
  if (pending) return pending
  bridge.closed = true
  const cleanup = (async () => {
    await request(bridge, 'STOP', 1000).catch(() => '')
    let forceStopError: unknown
    try { await unbudgetedAdb(bridge.deviceId, ['shell', 'am', 'force-stop', packageName]) }
    catch (error) { forceStopError = error }
    try { await waitForChildClose(bridge, 1000) }
    catch {
      bridge.child.kill('SIGTERM')
      try { await waitForChildClose(bridge, 1000) }
      catch {
        bridge.child.kill('SIGKILL')
        await waitForChildClose(bridge, 2000).catch(() => {})
      }
    }
    let forwardError: unknown
    try { await unbudgetedAdb(bridge.deviceId, ['forward', '--remove', `tcp:${bridge.hostPort}`]) }
    catch (error) { forwardError = error }
    if (forceStopError || !bridge.childClosed || forwardError) {
      const reason = forceStopError ?? (!bridge.childClosed ? 'instrumentation child did not close' : forwardError)
      throw new Error(`BRIDGE_CLEANUP_UNCONFIRMED: ${reason instanceof Error ? reason.message : String(reason)}`)
    }
    if (active.get(bridge.deviceId) === bridge) active.delete(bridge.deviceId)
  })()
  stopping.set(bridge.deviceId, cleanup)
  try { await cleanup } finally { stopping.delete(bridge.deviceId) }
}

async function launch(deviceId: string, apk: string): Promise<Bridge> {
  await unbudgetedAdb(deviceId, ['shell', 'am', 'force-stop', packageName])
  try {
    await execAdb(['install', '-r', apk], deviceId)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) throw error
    await execAdb(['uninstall', packageName], deviceId)
    await execAdb(['install', '-r', apk], deviceId)
  }
  const hostPort = Number(await execAdb(['forward', 'tcp:0', `tcp:${devicePort}`], deviceId))
  if (!Number.isInteger(hostPort) || hostPort <= 0) throw new Error('Android UI tree bridge could not obtain a host port')
  const child = spawn(getAdbCmd(), ['-s', deviceId, 'shell', 'am', 'instrument', '-w', component], { stdio: 'ignore' })
  const bridge: Bridge = { deviceId, hostPort, child, closed: false, childClosed: false }
  child.once('close', () => { bridge.childClosed = true })
  child.once('error', () => { /* Startup detects the failed child before a tree read. */ })
  active.set(deviceId, bridge)
  try {
    const deadline = Date.now() + Math.min(remainingBudget(3000), 3000)
    while (Date.now() < deadline) {
      if (bridge.childClosed || child.exitCode !== null || child.signalCode !== null) throw new Error('Android UI tree bridge exited during startup')
      try {
        if ((await request(bridge, 'PING', 250)).startsWith('OK\n')) {
          return bridge
        }
      } catch { /* The instrumentation process may still be starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Android UI tree bridge did not become ready')
  } catch (error) {
    await stop(bridge)
    throw error
  }
}

async function ensure(deviceId: string, apk: string): Promise<Bridge> {
  const pending = starting.get(deviceId)
  if (pending) return pending
  const ready = active.get(deviceId)
  if (ready && !ready.closed && !ready.childClosed && ready.child.exitCode === null && ready.child.signalCode === null) return ready
  if (ready) await stop(ready)
  const promise = launch(deviceId, apk)
  starting.set(deviceId, promise)
  try { return await promise } finally { starting.delete(deviceId) }
}

/** Returns null only after the bridge has been stopped, so legacy acquisition is safe. */
export async function readAndroidTreeFromBridge(deviceId: string): Promise<string | null> {
  const apk = configuredApk()
  if (!apk) return null
  let bridge: Bridge | undefined
  try {
    bridge = await ensure(deviceId, apk)
    const output = await request(bridge, 'TREE', remainingBudget(10000))
    if (!output.startsWith('OK\n') || !output.includes('<hierarchy')) throw new Error('Android UI tree bridge returned invalid hierarchy output')
    return output.slice(3)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('BRIDGE_CLEANUP_UNCONFIRMED')) throw error
    if (bridge) await stop(bridge)
    if (error instanceof Error && error.message === 'ACTION_TIMEOUT') throw error
    return null
  }
}

process.once('exit', () => {
  for (const bridge of active.values()) {
    spawnSync(getAdbCmd(), ['-s', bridge.deviceId, 'shell', 'am', 'force-stop', packageName], { timeout: 2000, stdio: 'ignore' })
    spawnSync(getAdbCmd(), ['-s', bridge.deviceId, 'forward', '--remove', `tcp:${bridge.hostPort}`], { timeout: 2000, stdio: 'ignore' })
  }
})
