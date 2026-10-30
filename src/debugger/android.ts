import { resolveAdbCmd } from '../utils/android/utils.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DebuggerError, debuggerRemaining, debuggerSignal, nativeError } from './worker.js'
const exec = promisify(execFile)
export interface DebugTarget { app_id: string; pid: number; process_name: string; start_identity: string; uid: number }
export interface DebugNative {
  candidates(device: string, app: string): Promise<DebugTarget[]>
  identity(device: string, target: DebugTarget): Promise<DebugTarget>
  forward(device: string, pid: number): Promise<number>
  removeForward(device: string, port: number, pid: number): Promise<void>
}
export class AndroidDebugNative implements DebugNative {
  async adb(device: string, args: string[]) {
    try { return (await exec(resolveAdbCmd(), ['-s', device, ...args], { timeout: debuggerRemaining(5000), signal: debuggerSignal(), maxBuffer: 1024 * 1024 })).stdout.trim() }
    catch (e) { throw nativeError(e, 'DEVICE_UNAVAILABLE') }
  }
  async identity(device: string, target: DebugTarget): Promise<DebugTarget> {
    try {
      const stat = await this.adb(device, ['shell', 'cat', `/proc/${target.pid}/stat`])
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/)
      const status = await this.adb(device, ['shell', 'cat', `/proc/${target.pid}/status`])
      const uid = Number(/^Uid:\s+(\d+)/m.exec(status)?.[1])
      const name = (await this.adb(device, ['shell', 'cat', `/proc/${target.pid}/cmdline`])).split('\0')[0]
      if (!/^\d+$/.test(fields[19] ?? '') || uid !== target.uid || name !== target.process_name || (target.start_identity && fields[19] !== target.start_identity)) throw new Error('identity')
      return { ...target, start_identity: fields[19] }
    } catch (e) { if (e instanceof DebuggerError && ['DEBUGGER_TIMEOUT', 'DEBUGGER_CANCELLED', 'DEVICE_UNAVAILABLE'].includes(e.code)) throw e; throw new DebuggerError('PROCESS_CHANGED') }
  }
  async candidates(device: string, app: string) {
    if (!/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(app)) throw new DebuggerError('INVALID_ARGUMENT')
    const packages = await this.adb(device, ['shell', 'cmd', 'package', 'list', 'packages', '-U', app])
    const uid = Number(new RegExp(`^package:${app.replaceAll('.', '\\.')} uid:(\\d+)$`, 'm').exec(packages)?.[1])
    if (!Number.isSafeInteger(uid)) throw new DebuggerError('PROCESS_NOT_FOUND')
    // `adb jdwp` is a subscription, not a one-shot command. Bound the sample.
    let jdwpOutput: string
    try { jdwpOutput = (await exec(resolveAdbCmd(), ['-s', device, 'jdwp'], { timeout: debuggerRemaining(500), signal: debuggerSignal(), maxBuffer: 1024 * 1024 })).stdout }
    catch (error: unknown) {
      const e = error as { killed?: boolean; stderr?: string; stdout?: string }
      if (debuggerSignal()?.aborted) throw new DebuggerError('DEBUGGER_CANCELLED')
      debuggerRemaining(1)
      if (!e.killed || e.stderr?.trim()) throw nativeError(e, 'DEVICE_UNAVAILABLE')
      jdwpOutput = e.stdout ?? ''
    }
    const jdwp = new Set(jdwpOutput.split(/\s+/).filter(id => /^\d+$/.test(id)))
    const ps = await this.adb(device, ['shell', 'ps', '-A', '-o', 'PID,NAME'])
    const result: DebugTarget[] = []
    for (const line of ps.split('\n').slice(1)) {
      const [pid, name] = line.trim().split(/\s+/)
      if (jdwp.has(pid) && (name === app || name.startsWith(app + ':'))) result.push(await this.identity(device, { app_id: app, pid: Number(pid), process_name: name, start_identity: '', uid }))
    }
    return result
  }
  async forward(device: string, pid: number) {
    const port = Number(await this.adb(device, ['forward', '--no-rebind', 'tcp:0', `jdwp:${pid}`]))
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new DebuggerError('DEBUGGER_ATTACH_FAILED')
    return port
  }
  async removeForward(device: string, port: number, pid: number) {
    const list = await this.adb(device, ['forward', '--list'])
    const entry = list.split('\n').find(line => line.trim().split(/\s+/)[1] === `tcp:${port}`)
    if (!entry) return
    const [serial, local, remote] = entry.trim().split(/\s+/)
    if (serial !== device || local !== `tcp:${port}` || remote !== `jdwp:${pid}`) throw new DebuggerError('DEBUGGER_CLEANUP_FAILED')
    await this.adb(device, ['forward', '--remove', `tcp:${port}`])
  }
}
