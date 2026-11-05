import { AsyncLocalStorage } from 'node:async_hooks'
import type { DeviceReadiness } from '../contracts/device-readiness.js'
import type { DeviceInfo } from '../types.js'
import { pausedReadiness } from '../debugger/guard.js'
import { execCmd } from '../utils/exec.js'
import { getAdbCmd } from '../utils/android/commands.js'
import { getXcrunCmd } from '../utils/ios/utils.js'
import { remainingBudget } from '../utils/operation-budget.js'

export function unknownDeviceReadiness(code?: string): DeviceReadiness {
  return { wakefulness: 'unknown', lock_state: 'unknown', input_ready: null, blockers: [], evidence: [], limitations: code ? [code] : [] }
}
function values(text: string, pattern: RegExp) { return [...text.matchAll(pattern)].map(match => match[1]) }
function unique(items: string[]) { return items.length > 0 && new Set(items).size === 1 ? items[0] : null }
export function parseAndroidPower(text: string): DeviceReadiness['wakefulness'] {
  // Later vendor/debug sections can repeat mWakefulness as a numeric enum.
  // Classify only the named current-state section when its boundary is present.
  const main = text.split('Power Manager State:')[1]
  if (main?.includes('Settings and Configuration:')) text = main.split('Settings and Configuration:')[0]
  const wake = unique(values(text, /^\s*mWakefulness=(\w+)\s*$/gm))
  const changing = unique(values(text, /^\s*mWakefulnessChanging=(true|false)\s*$/gm))
  if (!wake || !changing) return 'unknown'
  if (changing === 'true') return 'transitioning'
  return wake === 'Awake' ? 'awake' : ['Asleep', 'Dozing'].includes(wake) ? 'asleep' : 'unknown'
}
export function parseAndroidLock(text: string): DeviceReadiness['lock_state'] {
  const section = text.split(/\bKeyguardServiceDelegate\s*\n/)[1]
  if (!section) return 'unknown'
  const showing = unique(values(section, /^\s*(?:showing|mIsShowing)=(true|false)\s*$/gm))
  return showing === 'true' ? 'locked' : showing === 'false' ? 'unlocked' : 'unknown'
}
export function finishDeviceReadiness(state: DeviceReadiness): DeviceReadiness {
  if (state.wakefulness === 'asleep') state.blockers.push('DEVICE_ASLEEP')
  if (state.wakefulness === 'transitioning') state.blockers.push('DEVICE_TRANSITIONING')
  if (state.lock_state === 'locked') state.blockers.push('DEVICE_LOCKED')
  state.blockers = [...new Set(state.blockers)]
  state.input_ready = state.blockers.length ? false : null
  return state
}
export function parseIosLock(text: string): DeviceReadiness['lock_state'] {
  try {
    const data = JSON.parse(text)
    if (data.error?.domain === 'com.apple.dt.CoreDeviceError' && data.error.code === 1001 &&
      data.error.userInfo?.CapabilityFeatureIdentifier?.string === 'com.apple.coredevice.feature.getlockstate') return 'unsupported'
    // Successful response semantics require runtime validation before classification.
  } catch { /* Non-JSON output supplies no state evidence. */ }
  return 'unknown'
}
type Probe = (command: string, args: string[], timeout: number) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>
const probes = new AsyncLocalStorage<Probe>()
export function withDeviceReadinessProbe<T>(probe: Probe, operation: () => Promise<T>) { return probes.run(probe, operation) }
const nativeProbe: Probe = (command, args, timeout) => execCmd(command, args, { timeout })
export async function observeDeviceReadiness(device?: Pick<DeviceInfo, 'platform' | 'id'> | null, probe: Probe = probes.getStore() ?? nativeProbe): Promise<DeviceReadiness> {
  const state = unknownDeviceReadiness()
  if (!device?.id || !['android', 'ios'].includes(device.platform) || ['booted', 'default'].includes(device.id)) return unknownDeviceReadiness('DEVICE_TARGET_UNAVAILABLE')
  const paused = pausedReadiness(device.id, device.platform)
  if (paused) {
    state.blockers.push('DEBUGGER_PAUSED')
    state.evidence.push({ code: 'DEBUGGER_PAUSED', source: 'debugger', captured_at_ms: paused.captured_at_ms })
    return finishDeviceReadiness(state)
  }
  if (device.platform === 'android') {
    await androidProbe(state, device.id, 'power', probe)
    await androidProbe(state, device.id, 'window', probe)
  } else {
    state.limitations.push('DEVICE_WAKEFULNESS_UNVERIFIED')
    try {
      const timeout = remainingBudget(1000)
      // CoreDevice requires a CLI timeout of at least five seconds; the parent
      // subprocess deadline still caps this read at one second.
      const result = await probe(getXcrunCmd(), ['devicectl', 'device', 'info', 'lockState', '--device', device.id, '--timeout', '5', '--json-output', '-'], timeout)
      remainingBudget()
      state.lock_state = parseIosLock(result.stdout)
      if (state.lock_state === 'unsupported') state.evidence.push({ code: 'DEVICE_LOCK_SIGNAL_UNSUPPORTED', source: 'coredevice', captured_at_ms: Date.now() })
      else state.limitations.push('DEVICE_LOCK_OBSERVATION_UNAVAILABLE')
    } catch { state.limitations.push('DEVICE_LOCK_OBSERVATION_FAILED') }
  }
  return finishDeviceReadiness(state)
}
async function androidProbe(state: DeviceReadiness, id: string, kind: 'power' | 'window', probe: Probe) {
  try {
    const timeout = remainingBudget(1000)
    const result = await probe(getAdbCmd(), ['-s', id, 'shell', 'dumpsys', kind, ...(kind === 'window' ? ['policy'] : [])], timeout)
    remainingBudget()
    if (result.exitCode !== 0) throw new Error('PROBE_FAILED')
    const value = kind === 'power' ? parseAndroidPower(result.stdout) : parseAndroidLock(result.stdout)
    if (kind === 'power') state.wakefulness = value as DeviceReadiness['wakefulness']
    else state.lock_state = value as DeviceReadiness['lock_state']
    if (value === 'unknown') state.limitations.push(kind === 'power' ? 'DEVICE_WAKEFULNESS_UNVERIFIED' : 'DEVICE_LOCK_STATE_UNVERIFIED')
    else state.evidence.push({ code: `DEVICE_${value.toUpperCase()}`, source: `android_${kind}`, captured_at_ms: Date.now() })
  } catch { state.limitations.push(kind === 'power' ? 'DEVICE_POWER_OBSERVATION_FAILED' : 'DEVICE_LOCK_OBSERVATION_FAILED') }
}
