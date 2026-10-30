import type { ExpectScreenResponse } from '../../types.js'
import type { DeviceTarget } from '../observation.js'
import { buildObservationTrace } from '../interaction-trace.js'
export interface ScreenExpectation extends DeviceTarget { fingerprint?: string; screen?: string }
export interface ScreenAccess {
  fingerprint(target: DeviceTarget): Promise<{ fingerprint: string | null; activity?: string | null } | null>
  current(target: { deviceId?: string }): Promise<{ activity?: string; shortActivity?: string } | null>
}
function compareScreen(input: ScreenExpectation, observed: { fingerprint: string | null; screen: string | null }, label: string | null) {
  const { fingerprint, screen } = input
  if (fingerprint) {
    const success = observed.fingerprint === fingerprint
    return { success, basis: 'fingerprint' as const, reason: success ? `observed fingerprint matches expected fingerprint ${fingerprint}` : `expected fingerprint ${fingerprint} but observed ${observed.fingerprint ?? 'null'}` }
  }
  if (screen) {
    const candidates = new Set<string>()
    if (observed.screen) candidates.add(observed.screen)
    if (label) candidates.add(label)
    const success = candidates.has(screen)
    return { success, basis: 'screen' as const, reason: success ? `observed screen matches expected screen ${screen}` : `expected screen ${screen} but observed ${label ?? observed.screen ?? 'null'}` }
  }
  return { success: false, basis: 'none' as const, reason: 'No fingerprint or screen expectation provided' }
}
export async function expectScreen(input: ScreenExpectation, deps: ScreenAccess): Promise<ExpectScreenResponse> {
  const observed = await deps.fingerprint({ platform: input.platform, deviceId: input.deviceId })
  const screen = { fingerprint: observed?.fingerprint ?? null, screen: observed?.activity ?? null }
  let label = screen.screen
  if (!input.fingerprint && input.screen && input.platform !== 'ios') {
    try { const current = await deps.current({ deviceId: input.deviceId }); label = current?.shortActivity || current?.activity || label }
    catch { /* Keep the fingerprint-derived activity if current-screen lookup is unavailable. */ }
  }
  const comparison = compareScreen(input, screen, label)
  const expected = { fingerprint: input.fingerprint ?? null, screen: input.screen ?? null }
  const observedScreen = { fingerprint: screen.fingerprint, screen: label }
  return { success: comparison.success, observed_screen: observedScreen, expected_screen: expected,
    confidence: comparison.success ? 1 : 0, comparison: { basis: comparison.basis, matched: comparison.success, reason: comparison.reason },
    trace: buildObservationTrace({ actionType: 'expect_screen', stage: 'verify', success: comparison.success, attempts: 1,
      metadata: { expected_screen: expected, observed_screen: observedScreen, comparison: { basis: comparison.basis, matched: comparison.success } } }) }
}
