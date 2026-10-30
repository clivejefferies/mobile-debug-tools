import assert from 'node:assert/strict'
import { handleToolCall } from '../../../src/server-core.js'
import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { remainingBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  const originalTree = ToolsObserve.getUITreeHandler
  const originalTap = ToolsInteract.tapHandler
  const tab = () => ({ bounds: [244, 1408, 476, 1528], clickable: true, visible: true, enabled: true, children: [1] })
  const label = () => ({ text: 'GENER8', bounds: [330, 1489, 391, 1513], clickable: false, visible: true, enabled: true, parentId: 0 })
  let elements: any[] = [tab(), label()]
  let error: string | undefined
  let observedBudget = 0
  let reads = 0
  const taps: Array<{ x: number; y: number }> = []
  ToolsObserve.getUITreeHandler = async () => {
    observedBudget = remainingBudget()
    reads++
    return { device: { platform: 'android', id: 'fixture' }, elements, captured_at_ms: Date.now(), error } as any
  }
  ToolsInteract.tapHandler = async args => {
    taps.push({ x: args.x, y: args.y })
    return { device: { platform: 'android', id: 'fixture' }, success: true } as any
  }
  const call = async (args: Record<string, unknown> = {}) => JSON.parse((await handleToolCall('tap_element', {
    platform: 'android', deviceId: 'fixture', selector: { text: 'GENER8' }, responseMode: 'compact', verificationMode: 'none', ...args
  })).content[0].text!)
  try {
    for (const waitFor of [undefined, {}, { condition: 'exists' }, { condition: 'visible' }, { condition: 'clickable' }]) {
      reads = 0
      const result = await call(waitFor ? { waitFor } : {})
      assert.equal(result.success, true)
      assert.deepEqual(taps.at(-1), { x: 360, y: 1468 })
      assert.equal(reads, 1, 'Reuse the selector acquisition for dispatch resolution')
      assert.ok(observedBudget > 1500 && observedBudget <= 5000, `One acquisition should use the action budget: ${observedBudget}`)
    }
    await call({ actionTimeoutMs: 12000 })
    assert.ok(observedBudget > 10000 && observedBudget <= 12000)
    await call({ actionTimeoutMs: 12000, waitFor: { condition: 'exists', timeoutMs: 700 } })
    assert.ok(observedBudget > 0 && observedBudget <= 700)
    const tapCount = taps.length
    error = 'Failed to get UI tree: ACTION_TIMEOUT'
    const timeout = await call()
    assert.equal(timeout.failure_code, 'ACTION_TIMEOUT', 'Observation timeout must not claim that the label is missing')
    assert.equal(timeout.evidence.dispatch_started_at_ms, null)
    assert.equal(taps.length, tapCount)
    error = undefined

    for (const patch of [{ enabled: false }, { visible: false }]) {
      for (const condition of ['exists', 'visible', 'clickable']) {
        elements = [tab(), { ...label(), ...patch }]
        // A short explicit wait bounds unsatisfied visible/clickable conditions.
        const result = await call({ waitFor: { condition, timeoutMs: 100 } })
        assert.equal(result.success, false)
        assert.equal(taps.length, tapCount, 'Never bypass hidden/disabled labels through an enabled parent')
      }
    }
    elements = [{ ...tab(), enabled: false }, label()]
    assert.equal((await call({ waitFor: { condition: 'exists' } })).failure_code, 'ELEMENT_NOT_INTERACTABLE')
    assert.equal(taps.length, tapCount)
    elements = [label()]
    assert.equal((await call({ waitFor: { condition: 'exists' } })).failure_code, 'ELEMENT_NOT_INTERACTABLE')
    assert.equal(taps.length, tapCount, 'A plain label without an actionable container remains untappable')
    elements = [tab(), label(), { ...label(), parentId: 0 }]
    assert.equal((await call()).failure_code, 'AMBIGUOUS_TARGET')
    assert.equal(taps.length, tapCount)
    // Standalone waits keep returning the matched leaf for exists; promotion is tap-only.
    elements = [tab(), label()]
    const wait = await ToolsInteract.waitForUIHandler({ selector: { text: 'GENER8' }, condition: 'exists', platform: 'android', singleObservation: true })
    assert.equal(wait.element.index, 1)
  } finally {
    ToolsObserve.getUITreeHandler = originalTree
    ToolsInteract.tapHandler = originalTap
    ToolsInteract._resetResolvedUiElementsForTests()
  }
  console.log('Selector tap acquisition budget, executable ancestor, and rejection guards: PASS')
}
run().catch(error => { console.error(error); process.exit(1) })
