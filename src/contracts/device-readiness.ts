export interface DeviceReadiness {
  wakefulness: 'awake' | 'asleep' | 'transitioning' | 'unknown' | 'unsupported'
  lock_state: 'locked' | 'unlocked' | 'unknown' | 'unsupported'
  input_ready: false | null
  blockers: Array<'DEVICE_ASLEEP' | 'DEVICE_LOCKED' | 'DEVICE_TRANSITIONING' | 'DEBUGGER_PAUSED'>
  evidence: Array<{ code: string; source: string; captured_at_ms: number }>
  limitations: string[]
}
