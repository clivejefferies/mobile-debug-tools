import assert from 'assert'
import { ensureAdbAvailable } from '../../../src/utils/android/utils.js'
import { getXcrunCmd } from '../../../src/utils/ios/utils.js'
import { getSystemStatus } from '../../../src/system/index.js'

async function run() {
  const payload = await getSystemStatus()
  assert(typeof payload.success === 'boolean')
  assert(Array.isArray(payload.issues))

  const adb = ensureAdbAvailable()
  assert(adb && typeof adb.ok === 'boolean')

  const cmd = getXcrunCmd()
  assert(typeof cmd === 'string')

  console.log('get_system_status unit tests passed')
}

run().catch((error) => { console.error(error); process.exit(1) })
