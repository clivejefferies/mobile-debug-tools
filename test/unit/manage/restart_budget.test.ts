import assert from 'node:assert/strict'
import { AndroidManage } from '../../../src/manage/android.js'
import { iOSManage } from '../../../src/manage/ios.js'
import { remainingBudget, runWithBudget } from '../../../src/utils/operation-budget.js'

async function run() {
  const androidTerminate = AndroidManage.prototype.terminateApp
  const androidStart = AndroidManage.prototype.startApp
  const iosTerminate = iOSManage.prototype.terminateApp
  const iosStart = iOSManage.prototype.startApp
  const device = { platform: 'android', id: 'fixture' } as any
  let androidLaunchBudget = 0
  let iosLaunchBudget = 0
  try {
    AndroidManage.prototype.terminateApp = async () => ({ device, appTerminated: true })
    AndroidManage.prototype.startApp = async (_appId, _deviceId, timeoutMs) => {
      androidLaunchBudget = timeoutMs ?? 0
      return { device, appStarted: true } as any
    }
    iOSManage.prototype.terminateApp = async () => ({ device, appTerminated: true })
    iOSManage.prototype.startApp = async () => {
      iosLaunchBudget = remainingBudget()
      return { device, appStarted: true } as any
    }
    await runWithBudget(30000, () => new AndroidManage().restartApp('fixture', 'fixture', true, 30000))
    await runWithBudget(30000, () => new iOSManage().restartApp('fixture', 'fixture', false, true, 30000))
    assert.ok(androidLaunchBudget > 15000, `Android launch received ${androidLaunchBudget}ms`)
    assert.ok(iosLaunchBudget > 15000, `iOS launch received ${iosLaunchBudget}ms`)
  } finally {
    AndroidManage.prototype.terminateApp = androidTerminate
    AndroidManage.prototype.startApp = androidStart
    iOSManage.prototype.terminateApp = iosTerminate
    iOSManage.prototype.startApp = iosStart
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
