import assert from 'node:assert/strict'
import { getAppReadiness } from '../../../src/observe/readiness-service.js'
import { withDeviceReadinessProbe } from '../../../src/observe/device-readiness.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests } from '../../../src/utils/resolve-device.js'

async function run() {
  const original = ToolsObserve.getUITreeHandler
  let samples = 0
  _setDeviceListersForTests({ listAndroidDevices: async () => [{ id: 'fixture', platform: 'android', osVersion: '16', model: 'Fixture', simulator: true }] })
  ToolsObserve.getUITreeHandler = async () => { assert.fail('inconclusive probes must not clear a known device blocker') }
  try {
    const result = await withDeviceReadinessProbe(async (_cmd, args) => {
      if (args.includes('power')) samples++
      if (samples > 1) throw new Error('probe unavailable')
      return { exitCode: 0, stderr: '', stdout: args.includes('power') ? 'mWakefulness=Asleep\nmWakefulnessChanging=false' : 'KeyguardServiceDelegate\n showing=false\n mIsShowing=false' }
    }, () => getAppReadiness({ platform: 'android', deviceId: 'fixture', timeoutMs: 300, pollIntervalMs: 100 }, true))
    assert.ok(samples > 1, 'exercise a later inconclusive probe in the same wait')
    assert.equal(result.success, false)
    assert.equal(result.failure_code, 'READINESS_TIMEOUT')
    assert.deepEqual(result.device_readiness.blockers, ['DEVICE_ASLEEP'])
    assert.equal(result.device_readiness.input_ready, false)
    assert.ok(result.device_readiness.evidence.some(item => item.code === 'DEVICE_ASLEEP'))
    assert.ok(result.device_readiness.limitations.includes('DEVICE_POWER_OBSERVATION_FAILED'))
    assert.ok(result.readiness.limitations.includes('DEADLINE_EXCEEDED'))
    console.log('PASS readiness deadline retains the earlier blocker and later probe failure')
  } finally {
    ToolsObserve.getUITreeHandler = original
    _resetDeviceListersForTests()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
