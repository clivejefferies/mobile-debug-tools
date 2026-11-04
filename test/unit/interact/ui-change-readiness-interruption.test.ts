import assert from 'node:assert/strict'
import { ReadinessTracker, withReadinessTracker } from '../../../src/observe/readiness.js'
import { withDeviceReadinessProbe } from '../../../src/observe/device-readiness.js'
import { getSnapshotSessionId } from '../../../src/observe/snapshot-metadata.js'
import { waitForUIChange } from '../../../src/interact/waits/ui-change-wait.js'
import { resolveUiChangeScope } from '../../../src/interact/targeting/target-scope.js'
import type { Clock } from '../../../src/runtime/clock.js'

async function run() {
  let now = 10000
  const clock: Clock = { now: () => now, sleep: async ms => { now += ms } }
  class Tracker extends ReadinessTracker {
    override observe(tree: unknown, started: number) { return super.observe(tree, started, now) }
  }
  const tracker = new Tracker('android', 'fixture', 100)
  const readTimes: number[] = []
  const result = await withDeviceReadinessProbe(async (_command, args) => ({
    exitCode: 0, stderr: '', stdout: args.includes('power')
      ? `mWakefulness=${now >= 10600 && now < 11200 ? 'Asleep' : 'Awake'}\nmWakefulnessChanging=false`
      : 'KeyguardServiceDelegate\n showing=false\n mIsShowing=false'
  }), () => withReadinessTracker(tracker, () => waitForUIChange({ platform: 'android', deviceId: 'fixture', timeout_ms: 3000, stability_window_ms: 1200, expected_change: 'text_change' }, {
    clock,
    observe: async () => {
      const text = readTimes.length ? 'After' : 'Before'
      readTimes.push(now)
      return { device: { platform: 'android', id: 'fixture' }, screen: '', resolution: { width: 100, height: 100 },
        elements: [{ text, type: 'TextView', stable_id: 'label', visible: true, bounds: [0, 0, 100, 40] }],
        captured_at_ms: now, snapshot_revision: readTimes.length, snapshot_session_id: getSnapshotSessionId() }
    },
    scope: (tree, scope, target) => resolveUiChangeScope(tree, scope, target, () => null)
  })))
  assert.equal(result.success, true)
  assert.deepEqual(readTimes, [10000, 10300, 11200, 11500, 11800, 12100, 12400])
  assert.equal(result.elapsed_ms, 2400, 'the full change stability window starts again after the blocker')
  console.log('PASS readiness interruption resets UI-change stability, excluding blocked time')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
