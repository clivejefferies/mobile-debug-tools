import { computeScreenFingerprint } from '../../utils/ui/index.js'
import type { iOSObserve } from '../ios.js'
export async function collectGetScreenFingerprint(source: Pick<iOSObserve, 'getUITree'>, deviceId: string = 'booted'): Promise<{ fingerprint: string | null; activity?: string; error?: string; captured_at_ms?: number }> {
  try {
    const tree = await source.getUITree(deviceId)
    if (!tree || tree.error) return { fingerprint: null, error: tree && tree.error }

    return { ...computeScreenFingerprint(tree, null, 'ios', 50), captured_at_ms: tree.captured_at_ms }
  } catch (e) {
    return { fingerprint: null, error: e instanceof Error ? e.message : String(e) }
  }
}
