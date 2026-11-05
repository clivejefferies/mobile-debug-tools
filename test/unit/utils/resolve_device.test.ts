import assert from 'assert'
import {
  listDevices,
  resolveTargetDevice,
  _setDeviceListersForTests,
  _resetDeviceListersForTests
} from '../../../src/utils/resolve-device.js'

async function run() {
  try {
    _setDeviceListersForTests({
      listAndroidDevices: async () => ([
        { id: 'android-1', platform: 'android', osVersion: '14', model: 'Pixel 8', simulator: true },
        { id: 'android-2', platform: 'android', osVersion: '13', model: 'Pixel 7', simulator: false, appInstalled: true } as any
      ]),
      listIOSDevices: async () => ([
        { id: 'ios-1', platform: 'ios', osVersion: '18.0', model: 'iPhone 15', simulator: true, booted: false } as any,
        { id: 'ios-2', platform: 'ios', osVersion: '17.4', model: 'iPhone 14', simulator: true, booted: true } as any
      ])
    })

    const combined = await listDevices()
    assert.strictEqual(combined.length, 4)

    const explicit = await resolveTargetDevice({ platform: 'android', deviceId: 'android-1' })
    assert.strictEqual(explicit.id, 'android-1')

    const preferredPhysical = await resolveTargetDevice({ platform: 'android', prefer: 'physical' })
    assert.strictEqual(preferredPhysical.id, 'android-2')

    const installedForApp = await resolveTargetDevice({ platform: 'android', appId: 'com.example.app' })
    assert.strictEqual(installedForApp.id, 'android-2')

    const bootedIOS = await resolveTargetDevice({ platform: 'ios' })
    assert.strictEqual(bootedIOS.id, 'ios-2')

    _setDeviceListersForTests({
      listAndroidDevices: async () => ([
        { id: 'android-a', platform: 'android', osVersion: '14.0', model: 'Pixel 8', simulator: false },
        { id: 'android-b', platform: 'android', osVersion: '14.0', model: 'Pixel 8 Pro', simulator: false }
      ])
    })

    await assert.rejects(
      () => resolveTargetDevice({ platform: 'android' }),
      (error: unknown) => {
        assert(error instanceof Error)
        assert.match(error.message, /Multiple matching devices found/)
        assert.strictEqual(Array.isArray((error as any).devices), true)
        return true
      }
    )

    const base = { platform: 'android', model: 'Fixture', simulator: true }
    _setDeviceListersForTests({ listAndroidDevices: async () => [
      { ...base, id: 'unknown', osVersion: '17', appInstalled: true, appInstallation: {
        status: 'unknown', appId: 'com.example.app', deviceId: 'unknown', scope: 'android-current-user', checkedAt: null, reason: 'CHECK_FAILED'
      } },
      { ...base, id: 'installed', osVersion: '16', appInstallation: {
        status: 'installed', appId: 'com.example.app', deviceId: 'installed', scope: 'android-current-user', checkedAt: new Date(0).toISOString()
      } }
    ] })
    assert.equal((await resolveTargetDevice({ platform: 'android', appId: 'com.example.app' })).id, 'installed')
    assert.equal((await resolveTargetDevice({ platform: 'android', appId: 'com.other.app' })).id, 'unknown')
    console.log('resolve-device tests passed')
  } finally {
    _resetDeviceListersForTests()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
