import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'
import assert from 'assert'

const original = (Observe as any).ToolsObserve.getScreenFingerprintHandler

async function runTests() {
  console.log('Starting tests for wait_for_screen_change...')

  try {
    let seq1: Array<string | null> = ['B', 'B']
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: seq1.length ? seq1.shift() : null })
    const start1 = Date.now()
    const res1 = await ToolsInteract.waitForScreenChangeHandler({ platform: 'android', previousFingerprint: 'A', timeoutMs: 2000, pollIntervalMs: 50 })
    const elapsed1 = Date.now() - start1
    assert.ok(res1 && (res1 as any).success === true && (res1 as any).newFingerprint === 'B', 'Immediate fingerprint change should succeed')
    console.log('Test 1: Immediate change -> PASS', 'Elapsed:', elapsed1, 'ms')

    let seq2: Array<string | null> = [null, null, 'B', 'B']
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: seq2.length ? seq2.shift() : 'B' })
    const res2 = await ToolsInteract.waitForScreenChangeHandler({ platform: 'android', previousFingerprint: 'A', timeoutMs: 3000, pollIntervalMs: 50 })
    assert.ok(res2 && (res2 as any).success === true && (res2 as any).newFingerprint === 'B', 'Transient nulls should not prevent success')
    console.log('Test 2: Transient nulls -> PASS')

    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: 'A' })
    const res3 = await ToolsInteract.waitForScreenChangeHandler({ platform: 'android', previousFingerprint: 'A', timeoutMs: 300, pollIntervalMs: 50 })
    assert.ok(res3 && (res3 as any).success === false && (res3 as any).reason === 'timeout', 'Unchanged fingerprint should time out')
    console.log('Test 3: Timeout -> PASS')
  } finally {
    ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = original
  }
}

runTests().catch((error) => { console.error(error); process.exit(1) })
