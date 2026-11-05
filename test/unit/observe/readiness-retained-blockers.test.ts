import assert from 'node:assert/strict'
import { ReadinessTracker } from '../../../src/observe/readiness.js'
import { withDeviceReadinessProbe } from '../../../src/observe/device-readiness.js'
import { runWithBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  let power = 'Asleep', lock = 'true', fail = false
  const tracker = new ReadinessTracker('android', 'fixture')
  const observe = () => withDeviceReadinessProbe(async (_command, args) => {
    if (fail) throw new Error('native failure')
    return { exitCode: 0, stderr: '', stdout: args.includes('power')
      ? (power ? `mWakefulness=${power}\nmWakefulnessChanging=false` : '')
      : (lock ? `KeyguardServiceDelegate\n showing=${lock}\n mIsShowing=${lock}` : '') }
  }, () => tracker.observeDevice())
  await observe()
  const blockedEvidence = structuredClone(tracker.deviceReadiness.evidence)
  fail = true
  await observe()
  assert.deepEqual(tracker.deviceReadiness.blockers, ['DEVICE_ASLEEP', 'DEVICE_LOCKED'])
  assert.deepEqual(tracker.deviceReadiness.evidence, blockedEvidence, 'retained evidence keeps its original timestamps')
  assert.ok(tracker.deviceReadiness.limitations.includes('DEVICE_POWER_OBSERVATION_FAILED'))
  assert.ok(tracker.deviceReadiness.limitations.includes('DEVICE_LOCK_OBSERVATION_FAILED'))
  assert.ok(tracker.deviceReadiness.limitations.includes('DEVICE_BLOCKER_EVIDENCE_RETAINED'))
  await runWithBudget(0, observe)
  tracker.deadline()
  assert.deepEqual(tracker.deviceReadiness.blockers, ['DEVICE_ASLEEP', 'DEVICE_LOCKED'])
  assert.deepEqual(tracker.deviceReadiness.evidence, blockedEvidence)
  fail = false; power = 'Awake'; lock = ''
  await observe()
  assert.deepEqual(tracker.deviceReadiness.blockers, ['DEVICE_LOCKED'], 'fresh awake evidence clears only the power blocker')
  assert.equal(tracker.deviceReadiness.input_ready, false)
  power = ''; lock = 'false'
  await observe()
  assert.deepEqual(tracker.deviceReadiness.blockers, [], 'fresh unlocked evidence clears the remaining lock blocker')
  assert.equal(tracker.deviceReadiness.wakefulness, 'unknown', 'do not retain previously clear observations')
  assert.equal(tracker.deviceReadiness.input_ready, null)
  assert.ok(!tracker.deviceReadiness.limitations.includes('DEVICE_BLOCKER_EVIDENCE_RETAINED'))
  console.log('PASS inconclusive/expired probes retain blockers per axis; only fresh clear signals remove them')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
