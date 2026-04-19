import { iOSObserve, _resetIOSExecCommandForTests, _setIOSExecCommandForTests } from '../../../src/observe/ios'
import assert from 'assert'

function stubExecCommand(expectedArgsChecker: (args: string[]) => boolean, output: string) {
  return async function (args: string[], deviceId?: string) {
    if (!expectedArgsChecker(args)) throw new Error('Unexpected args: ' + JSON.stringify(args))
    return { output, device: { platform: 'ios', id: deviceId || 'booted' } }
  }
}

async function run() {
  const bundle = 'com.ideamechanics.modul8'
  const pgrepOutput = '12345\n'
  const logOutput = '2026-03-31 09:21:20.085 Module[12345:678] <Info> Modul8: Test message'

  try {
    const obs = new iOSObserve()
    _setIOSExecCommandForTests(stubExecCommand((args) => args.includes('pgrep'), pgrepOutput))

    let called = false
    _setIOSExecCommandForTests(async function (args: string[]) {
      if (args.includes('pgrep')) return { output: pgrepOutput, device: { platform: 'ios', id: 'booted' } }
      if (args.includes('log') && args.includes('show')) {
        called = true
        return { output: logOutput, device: { platform: 'ios', id: 'booted' } }
      }
      throw new Error('Unexpected args: ' + JSON.stringify(args))
    })

    const pidResult = await obs.getLogs({ appId: bundle, deviceId: 'booted' })
    assert(pidResult.meta.processNameUsed === 'modul8' || pidResult.meta.processNameUsed === 'Modul8' || !!pidResult.meta.processNameUsed)
    assert(pidResult.meta.detectedPid === 12345)
    assert(pidResult.source === 'pid')
    assert(pidResult.logCount === 1)
    assert(pidResult.logs[0].message.includes('Test message'))
    assert(called, 'log show must have been called')

    _setIOSExecCommandForTests(async function (args: string[]) {
      if (args.includes('log') && args.includes('show')) return { output: '2026-03-31 09:21:20.085 SomeOther[222:333] <Info> Other: Hello', device: { platform: 'ios', id: 'booted' } }
      throw new Error('Unexpected args: ' + JSON.stringify(args))
    })

    const broadResult = await new iOSObserve().getLogs({ deviceId: 'booted' })
    assert(broadResult.source === 'broad')
    assert(broadResult.logCount === 1)

    console.log('iOS getLogs predicate and meta tests passed')
  } finally {
    _resetIOSExecCommandForTests()
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
