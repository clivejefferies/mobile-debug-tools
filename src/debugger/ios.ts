import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { getXcrunCmd } from '../utils/ios/utils.js'
import type { DebugNative, DebugTarget } from './android.js'
import { DebuggerError, debuggerRemaining, debuggerSignal, nativeError } from './worker.js'
const exec = promisify(execFile)
export async function iosExec(file: string, args: string[], env?: NodeJS.ProcessEnv) {
  try { return (await exec(file, args, { timeout: debuggerRemaining(5000), signal: debuggerSignal(), maxBuffer: 1024 * 1024, ...(env ? { env } : {}) })).stdout.trim() }
  catch (e) { throw nativeError(e, 'DEVICE_UNAVAILABLE') }
}
export class IOSDebugNative implements DebugNative {
  constructor(private run = iosExec) {}
  private sim(args: string[]) { return this.run(getXcrunCmd(), ['simctl', ...args]) }
  async candidates(device: string, app: string): Promise<DebugTarget[]> {
    if (!/^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/.test(device) || !/^[A-Za-z0-9][A-Za-z0-9.-]+$/.test(app)) throw new DebuggerError('INVALID_ARGUMENT')
    const inventory = JSON.parse(await this.sim(['list', 'devices', 'booted', '--json'])) as { devices: Record<string, { udid: string; state: string }[]> }
    if (!Object.values(inventory.devices).flat().some(d => d.udid === device && d.state === 'Booted')) throw new DebuggerError('DEBUGGER_UNSUPPORTED')
    const services = await this.sim(['spawn', device, 'launchctl', 'list'])
    const pids = this.processes(services, app)
    if (!pids.length) return []
    const container = await this.sim(['get_app_container', device, app, 'app'])
    const executable = await this.run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(container, 'Info.plist')])
    if (path.basename(executable) !== executable || !executable) throw new DebuggerError('PROCESS_NOT_FOUND')
    const executablePath = await realpath(path.join(container, executable))
    return Promise.all(pids.map(pid => this.identity(device, { app_id: app, pid, process_name: executable, executable_path: executablePath, start_identity: '', uid: null })))
  }
  private processes(services: string, app: string) {
    return services.split('\n').flatMap(line => {
      const [pid, , label] = line.trim().split(/\s+/)
      return /^\d+$/.test(pid) && label?.startsWith(`UIKitApplication:${app}[`) ? [Number(pid)] : []
    })
  }
  async identity(device: string, target: DebugTarget): Promise<DebugTarget> {
    const services = await this.sim(['spawn', device, 'launchctl', 'list'])
    if (!this.processes(services, target.app_id).includes(target.pid)) throw new DebuggerError('PROCESS_CHANGED')
    const command = await this.run('/bin/ps', ['-ww', '-p', String(target.pid), '-o', 'comm='])
    const started = await this.run('/bin/ps', ['-p', String(target.pid), '-o', 'lstart='])
    if (command !== target.executable_path || !started || (target.start_identity && started !== target.start_identity)) throw new DebuggerError('PROCESS_CHANGED')
    return { ...target, start_identity: started }
  }
  async forward(): Promise<number> { throw new DebuggerError('DEBUGGER_UNSUPPORTED') }
  async removeForward() { throw new DebuggerError('DEBUGGER_UNSUPPORTED') }
}
