import assert from 'node:assert/strict'
import { cleanupReadinessDevice } from '../../device/automated/observe/device-readiness-cleanup.js'

async function run() {
  for (const failedStep of [0, 1, 2]) {
    const commands: string[][] = []
    let closed = 0
    const commandFailure = new Error('disconnected')
    const closeFailure = new Error('close failed')
    const failures = await cleanupReadinessDevice(true, (...args) => {
      commands.push(args)
      if (commands.length - 1 === failedStep) throw commandFailure
    }, async () => { closed++; throw closeFailure })
    assert.equal(commands.length, 3, 'a failed restoration must not skip later steps')
    assert.equal(commands[2].at(-1), '3', 'Home is attempted')
    assert.equal(closed, 1, 'client close always attempted')
    assert.deepEqual(failures, [commandFailure, closeFailure])
  }
  let closed = false
  assert.deepEqual(await cleanupReadinessDevice(false, () => { assert.fail('restoration disabled') }, async () => { closed = true }), [])
  assert.equal(closed, true)
  console.log('PASS readiness cleanup continues after each ADB failure and closes the client')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
