import assert from 'node:assert/strict'
import { handleToolCall } from '../../../src/server-core.js'
import { AndroidInteract } from '../../../src/interact/android.js'
import { _setDeviceListersForTests, _resetDeviceListersForTests, withResolvedDevice } from '../../../src/utils/resolve-device.js'
import { withDeviceReadinessProbe } from '../../../src/observe/device-readiness.js'

async function run() {
  const physical = { platform: 'android', id: 'physical', model: 'Fixture', osVersion: '16', simulator: false }
  const emulator = { ...physical, id: 'emulator', simulator: true }
  const originalTap = AndroidInteract.prototype.tap, originalSwipe = AndroidInteract.prototype.swipe
  let dispatched = '', dispatches = 0, resolutions = 0
  _setDeviceListersForTests({ listAndroidDevices: async () => { resolutions++; return [emulator, physical] } })
  AndroidInteract.prototype.tap = async (x, y, id) => {
    dispatched = id!; dispatches++
    return { success: true, device: id === physical.id ? physical : emulator, x, y }
  }
  AndroidInteract.prototype.swipe = async (x1, y1, x2, y2, duration, id) => {
    dispatched = id!; dispatches++
    return { success: true, device: id === physical.id ? physical : emulator, start: [x1, y1], end: [x2, y2], duration }
  }
  try {
    for (const tool of ['tap', 'swipe']) {
      for (const responseMode of ['compact', 'debug']) {
        for (const explicit of [false, true]) {
          const expected = explicit ? emulator.id : physical.id
          const probes: string[] = []
          const response = await withDeviceReadinessProbe(async (_cmd, args) => {
            probes.push(args[1])
            return { exitCode: 0, stderr: '', stdout: args.includes('power') ? 'mWakefulness=Asleep\nmWakefulnessChanging=false' : 'KeyguardServiceDelegate\n showing=false\n mIsShowing=false' }
          }, () => handleToolCall(tool, { platform: 'android', ...(explicit ? { deviceId: emulator.id } : {}), x: 1, y: 2, x1: 1, y1: 2, x2: 3, y2: 4, duration: 100, verificationMode: 'none', responseMode }))
          const result = JSON.parse(response.content[0].text!)
          assert.equal(result.success, true)
          assert.equal(dispatched, expected)
          assert.deepEqual(probes, [expected, expected], 'readiness probes use the device actually selected for dispatch')
          assert.deepEqual(result.device_readiness.blockers, ['DEVICE_ASLEEP'])
        }
      }
    }
    assert.equal(dispatches, 8)
    assert.equal(resolutions, 8, 'readiness does not select another device')
    const before = resolutions
    await withResolvedDevice(emulator, () => withDeviceReadinessProbe(async (_cmd, args) => {
      assert.equal(args[1], emulator.id)
      return { exitCode: 0, stderr: '', stdout: '' }
    }, () => handleToolCall('tap', { x: 1, y: 2, verificationMode: 'none', responseMode: 'compact' })))
    assert.equal(dispatched, emulator.id, 'an existing resolved/guarded target is preserved')
    assert.equal(resolutions, before)
    console.log('PASS ordinary tap/swipe device readiness follows implicit, explicit and already-resolved targets')
  } finally {
    AndroidInteract.prototype.tap = originalTap
    AndroidInteract.prototype.swipe = originalSwipe
    _resetDeviceListersForTests()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
