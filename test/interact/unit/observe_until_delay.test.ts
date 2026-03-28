import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

async function run() {
  console.log('Starting observe_until observationDelay unit test...')
  const origGetUITree = (Observe as any).ToolsObserve.getUITreeHandler
  try {
    const start = Number(process.hrtime.bigint() / 1000000n)
    // Mock getUITreeHandler: only return the target element after observationDelayMs has passed
    (Observe as any).ToolsObserve.getUITreeHandler = async ({ platform, deviceId }: any) => {
      const elapsed = Date.now() - start
      if (elapsed < 300) {
        return { device: { platform: platform || 'android', id: deviceId || 'mock' }, screen: '', resolution: { width: 100, height: 200 }, elements: [] }
      }
      return { device: { platform: platform || 'android', id: deviceId || 'mock' }, screen: '', resolution: { width: 100, height: 200 }, elements: [ { text: 'Play session', clickable: true, visible: true, bounds: [0,0,10,10] } ] }
    }

    const res = await ToolsInteract.observeUntilHandler({ type: 'ui', query: 'Play session', timeoutMs: 2000, pollIntervalMs: 100, stability_ms: 100, observationDelayMs: 300, platform: 'ios' })
    const ok = res && (res as any).success && (res as any).duration_ms >= 300
    console.log('ObservationDelay Test:', ok ? 'PASS' : 'FAIL', JSON.stringify({ duration_ms: (res as any).duration_ms, poll_count: (res as any).poll_count }, null, 2))
  } finally {
    ;(Observe as any).ToolsObserve.getUITreeHandler = origGetUITree
  }
}

run().catch(console.error)
