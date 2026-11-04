import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getXcrunCmd } from '../../utils/ios/utils.js'
import { traceCommand, type TraceSpawn, spawnTrace } from './process.js'
import { prepareNotification } from './notification.js'

export const IOS_TEMPLATES = ['System Trace', 'Time Profiler', 'Animation Hitches', 'Hangs'] as const
export type IosTemplate = typeof IOS_TEMPLATES[number]
export interface IosTarget { id: string; platform: 'ios'; simulator: boolean; osVersion: string; model: string }
export interface IosApp { app_id: string; pid: number; executable: string; started_at: string }
export interface IosCapabilities {
  supported: boolean; backend: 'xctrace'; device: IosTarget | null; xcode_version: string | null
  prerequisites: Record<string, 'available' | 'missing' | 'unknown'>; reasons: string[]; recovery: string[]
  discovered_templates: string[]; templates: { name: IosTemplate; supported: boolean; coverage: string; reason: string | null }[]
  app: IosApp | null; limitations: string[]
}
interface Simulators { devices: Record<string, { udid: string; state: string; name: string; isAvailable: boolean }[]> }
export async function resolveIosApp(device: string, appId: string, spawn: TraceSpawn = spawnTrace): Promise<IosApp> {
  const run = (args: string[]) => traceCommand(getXcrunCmd(), args, 10000, spawn)
  const container = await run(['simctl', 'get_app_container', device, appId, 'app'])
  if (!path.isAbsolute(container) || !container.endsWith('.app')) throw new Error('APP_IDENTITY_UNAVAILABLE')
  const output = await run(['simctl', 'spawn', device, 'launchctl', 'list'])
  const ids = output.split('\n').filter(line => line.includes(`UIKitApplication:${appId}[`))
    .map(line => Number(line.trim().split(/\s+/)[0])).filter(pid => Number.isSafeInteger(pid) && pid > 1)
  if (ids.length !== 1) throw new Error('APP_NOT_RUNNING')
  const executable = await traceCommand('/bin/ps', ['-p', String(ids[0]), '-o', 'comm='], 10000, spawn)
  if (!executable.startsWith(container + '/') || executable.includes('\n')) throw new Error('APP_IDENTITY_UNAVAILABLE')
  const started_at = await traceCommand('/bin/ps', ['-p', String(ids[0]), '-o', 'lstart='], 10000, spawn)
  if (!started_at || started_at.includes('\n')) throw new Error('APP_IDENTITY_UNAVAILABLE')
  return { app_id: appId, pid: ids[0], executable, started_at }
}
export async function iosCapabilities(device: string, appId?: string, template: IosTemplate = 'Time Profiler', spawn: TraceSpawn = spawnTrace, host: string = process.platform): Promise<IosCapabilities> {
  const result: IosCapabilities = {
    supported: false, backend: 'xctrace', device: null, xcode_version: null,
    prerequisites: { host: host === 'darwin' ? 'available' : 'missing', permissions: 'unknown', symbols: 'unknown' },
    reasons: [], recovery: [], discovered_templates: [], templates: [], app: null,
    limitations: ['App attachment may include sensitive system metadata, paths, logs and signposts.', 'Permissions and symbolication are not established by discovery.', 'Physical iOS capture is not supported in the initial matrix.']
  }
  if (host !== 'darwin') { result.reasons.push('MACOS_REQUIRED'); return result }
  const probe = async (key: string, fn: () => Promise<void>, recovery: string) => {
    try { await fn(); result.prerequisites[key] = 'available' }
    catch (error) { result.prerequisites[key] = 'missing'; result.reasons.push(error instanceof Error && ['APP_NOT_RUNNING', 'APP_IDENTITY_UNAVAILABLE'].includes(error.message) ? error.message : key.toUpperCase() + '_UNAVAILABLE'); result.recovery.push(recovery) }
  }
  await probe('xcode', async () => { result.xcode_version = await traceCommand(getXcrunCmd(), ['xcodebuild', '-version'], 10000, spawn) }, 'Select a full Xcode installation with xcode-select.')
  await probe('templates', async () => {
    const output = await traceCommand(getXcrunCmd(), ['xctrace', 'list', 'templates'], 10000, spawn)
    result.discovered_templates = output.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('=='))
  }, 'Install/select Xcode with Instruments and run xcrun xctrace list templates.')
  await probe('instruments_targets', async () => {
    const targets = await traceCommand(getXcrunCmd(), ['xctrace', 'list', 'devices'], 15000, spawn)
    if (!targets.includes(`(${device})`)) throw new Error('TARGET_UNAVAILABLE')
  }, 'Check xcrun xctrace list devices; use a simulator visible to Instruments.')
  await probe('target', async () => {
    const data = JSON.parse(await traceCommand(getXcrunCmd(), ['simctl', 'list', 'devices', '--json'], 10000, spawn)) as Simulators
    const entries = Object.entries(data.devices).flatMap(([runtime, values]) => values.map(value => ({ ...value, runtime })))
    const target = entries.find(d => d.udid === device)
    if (!target || !target.isAvailable || target.state !== 'Booted') throw new Error('TARGET_UNAVAILABLE')
    result.device = { platform: 'ios', id: target.udid, simulator: true, model: target.name, osVersion: target.runtime.split('iOS-')[1]?.replaceAll('-', '.') ?? target.runtime }
  }, 'Use an explicit booted simulator UDID. Physical devices and the Mac host are unsupported.')
  await probe('notification_helper', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-trace-probe-'))
    try { await prepareNotification(directory, spawn) } finally { await fs.rm(directory, { recursive: true, force: true }) }
  }, 'Allow Xcode clang to compile the local Darwin-notification listener.')
  if (appId && result.device) await probe('app', async () => { result.app = await resolveIosApp(device, appId, spawn) }, 'Start the requested development app on the selected simulator before tracing.')
  result.templates = IOS_TEMPLATES.map(name => ({ name,
    supported: name === 'Time Profiler' && result.discovered_templates.includes(name) && result.device !== null,
    coverage: name === 'Time Profiler' ? 'CPU samples; bundled Hangs instrument is not independently verified' : name === 'System Trace' ? 'Scheduling coverage unverified' : name === 'Hangs' ? 'Not a standalone template here' : 'Unsupported on tested simulator',
    reason: name === 'Time Profiler' ? null : 'TEMPLATE_TARGET_UNSUPPORTED'
  }))
  if (!result.templates.find(t => t.name === template)?.supported) result.reasons.push('TEMPLATE_TARGET_UNSUPPORTED')
  result.supported = result.reasons.length === 0
  return result
}
