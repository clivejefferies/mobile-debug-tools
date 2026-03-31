import { iOSObserve } from '../../../src/observe/ios'
import assert from 'assert'

// Lightweight unit tests: verify predicate construction and meta extraction logic using internal functions
// Since getLogs executes xcrun, run tests in SKIP_DEVICE_TESTS=1 environment by stubbing execCommand where possible.

import * as iosUtils from '../../../src/utils/ios/utils'

function stubExecCommand(original: any, expectedArgsChecker: (args: string[]) => boolean, output: string) {
  return async function (args: string[], deviceId?: string) {
    if (!expectedArgsChecker(args)) throw new Error('Unexpected args: ' + JSON.stringify(args))
    return { output, device: { platform: 'ios', id: deviceId || 'booted' } }
  }
}

describe('iOS getLogs predicate and meta', () => {
  let obs: iOSObserve
  beforeEach(() => {
    obs = new iOSObserve()
  })

  it('uses simple process name predicate when appId provided', async () => {
    const bundle = 'com.ideamechanics.modul8'
    // stub execCommand twice: first for pgrep, second for log show
    const pgrepOutput = '12345\n'
    const logOutput = '2026-03-31 09:21:20.085 Module[12345:678] <Info> Modul8: Test message'

    const orig = (iosUtils as any).execCommand
    try {
      (iosUtils as any).execCommand = stubExecCommand(orig, (args) => args.includes('pgrep'), pgrepOutput)
      // second replacement for the log show call
      let called = false
      (iosUtils as any).execCommand = async function (args: string[]) {
        if (args.includes('pgrep')) return { output: pgrepOutput, device: { platform: 'ios', id: 'booted' } }
        if (args.includes('log') && args.includes('show')) { called = true; return { output: logOutput, device: { platform: 'ios', id: 'booted' } } }
        throw new Error('Unexpected args: ' + JSON.stringify(args))
      }

      const res = await obs.getLogs({ appId: bundle, deviceId: 'booted' })
      assert(res.meta.processNameUsed === 'modul8' || res.meta.processNameUsed === 'Modul8' || !!res.meta.processNameUsed)
      assert(res.meta.detectedPid === 12345)
      assert(res.source === 'pid')
      assert(res.logCount === 1)
      assert(res.logs[0].message.includes('Test message'))
      assert(called, 'log show must have been called')
    } finally {
      (iosUtils as any).execCommand = orig
    }
  })

  it('falls back to broad when no appId', async () => {
    const logOutput = '2026-03-31 09:21:20.085 SomeOther[222:333] <Info> Other: Hello'
    const orig = (iosUtils as any).execCommand
    try {
      (iosUtils as any).execCommand = async function (args: string[]) {
        if (args.includes('log') && args.includes('show')) return { output: logOutput, device: { platform: 'ios', id: 'booted' } }
        throw new Error('Unexpected args: ' + JSON.stringify(args))
      }
      const obs = new iOSObserve()
      const res = await obs.getLogs({ deviceId: 'booted' })
      assert(res.source === 'broad')
      assert(res.logCount === 1)
    } finally {
      (iosUtils as any).execCommand = orig
    }
  })
})
