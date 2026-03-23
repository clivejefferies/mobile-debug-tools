import { ToolsInteract } from '../../../src/interact/index.js'
import * as Observe from '../../../src/observe/index.js'

const original = (Observe as any).ToolsObserve.getScreenFingerprintHandler

async function runTests() {
  console.log('Starting tests for wait_for_screen_change...')

  // Test 1: Immediate change
  let seq1: Array<string | null> = ['B','B']
  ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: seq1.length ? seq1.shift() : null })
  const start1 = Date.now()
  const res1 = await ToolsInteract.waitForScreenChangeHandler({ platform: 'android', previousFingerprint: 'A', timeoutMs: 2000, pollIntervalMs: 50 })
  const elapsed1 = Date.now() - start1
  console.log('Test 1: Immediate change ->', (res1 && (res1 as any).success === true && (res1 as any).newFingerprint === 'B') ? 'PASS' : 'FAIL', 'Elapsed:', elapsed1, 'ms')

  // Test 2: Transient nulls then stable change
  let seq2: Array<string | null> = [null, null, 'B', 'B']
  ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: seq2.length ? seq2.shift() : 'B' })
  const res2 = await ToolsInteract.waitForScreenChangeHandler({ platform: 'android', previousFingerprint: 'A', timeoutMs: 3000, pollIntervalMs: 50 })
  console.log('Test 2: Transient nulls ->', (res2 && (res2 as any).success === true && (res2 as any).newFingerprint === 'B') ? 'PASS' : 'FAIL')

  // Test 3: Timeout
  ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = async () => ({ fingerprint: 'A' })
  const res3 = await ToolsInteract.waitForScreenChangeHandler({ platform: 'android', previousFingerprint: 'A', timeoutMs: 300, pollIntervalMs: 50 })
  console.log('Test 3: Timeout ->', (res3 && (res3 as any).success === false && (res3 as any).reason === 'timeout') ? 'PASS' : 'FAIL')

  // Restore original
  ;(Observe as any).ToolsObserve.getScreenFingerprintHandler = original
}

runTests().catch(console.error)
