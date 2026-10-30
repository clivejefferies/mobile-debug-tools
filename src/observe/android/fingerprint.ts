import { computeScreenFingerprint } from "../../utils/ui/index.js"
import type { AndroidObserve } from '../android.js'
export async function collectGetScreenFingerprint(source: Pick<AndroidObserve, 'getUITree' | 'getCurrentScreen'>, deviceId?: string): Promise<{ fingerprint: string | null; activity?: string; error?: string; captured_at_ms?: number }> {
  try {
    const tree = await source.getUITree(deviceId)
    if (!tree || tree.error) return { fingerprint: null, error: tree.error }

    const current = await source.getCurrentScreen(deviceId).catch(() => null)
    return { ...computeScreenFingerprint(tree, current, 'android', 50), captured_at_ms: tree.captured_at_ms }
  } catch (e) {
    return { fingerprint: null, error: e instanceof Error ? e.message : String(e) }
  }
}
