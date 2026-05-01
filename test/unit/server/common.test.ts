import assert from 'assert'
import { createTraceStep } from '../../../src/server/common.js'
import { buildActionExecutionResult, inferGenericFailure, requireBooleanArg } from '../../../src/server/common.js'

function run() {
  assert.strictEqual(requireBooleanArg({ exact: true }, 'exact'), true)
  assert.strictEqual(requireBooleanArg({ exact: false }, 'exact'), false)
  assert.throws(() => requireBooleanArg({}, 'exact'), /Missing or invalid boolean argument: exact/)
  assert.throws(() => requireBooleanArg({ exact: 'true' as unknown as boolean }, 'exact'), /Missing or invalid boolean argument: exact/)

  assert.deepStrictEqual(inferGenericFailure('semantic mismatch between inferred and raw state'), {
    failureCode: 'SEMANTIC_MISMATCH',
    retryable: false
  })

  const recoveryResult = buildActionExecutionResult({
    actionType: 'tap',
    sourceModule: 'server',
    selector: { x: 10, y: 20 },
    success: false,
    uiFingerprintBefore: 'fp_before',
    uiFingerprintAfter: 'fp_after',
    failure: { failureCode: 'SEMANTIC_MISMATCH', retryable: false }
  })
  assert.strictEqual(recoveryResult.failure_code, 'SEMANTIC_MISMATCH')
  assert.strictEqual(recoveryResult.recovery?.failure_class, 'SemanticMismatchFailure')
  assert.strictEqual(recoveryResult.recovery?.runtime_code, 'SEMANTIC_MISMATCH')
  assert.strictEqual(recoveryResult.recovery?.retry_allowed, false)
  assert.strictEqual(recoveryResult.recovery?.max_recovery_attempts, 3)
  assert.strictEqual(recoveryResult.recovery?.max_retry_depth, 3)
  assert.strictEqual(recoveryResult.trace.final_outcome, 'failure')
  assert.strictEqual(recoveryResult.trace.steps.at(-1)?.stage, 'recover')

  const notInteractableResult = buildActionExecutionResult({
    actionType: 'tap',
    sourceModule: 'server',
    selector: { x: 5, y: 5 },
    success: false,
    uiFingerprintBefore: 'fp_before',
    uiFingerprintAfter: 'fp_after',
    failure: { failureCode: 'ELEMENT_NOT_INTERACTABLE', retryable: true }
  })
  assert.strictEqual(notInteractableResult.failure_code, 'ELEMENT_NOT_INTERACTABLE')
  assert.strictEqual(notInteractableResult.recovery?.failure_class, 'ExecutionFailure')
  assert.strictEqual(notInteractableResult.recovery?.runtime_code, 'ELEMENT_NOT_INTERACTABLE')
  assert.strictEqual(notInteractableResult.recovery?.retry_allowed, true)
  assert.strictEqual(notInteractableResult.trace.steps[0].stage, 'resolve')
  assert.strictEqual(notInteractableResult.trace.steps[0].result, 'failure')
  assert.strictEqual(notInteractableResult.trace.steps.at(-1)?.stage, 'recover')

  const traceSteps = [
    createTraceStep({ stage: 'resolve', timestamp: 100, result: 'success', attemptIndex: 0 }),
    createTraceStep({ stage: 'execute', timestamp: 200, result: 'retry', attemptIndex: 1 }),
    createTraceStep({ stage: 'verify', timestamp: 300, result: 'success', attemptIndex: 2 })
  ]
  const tracedResult = buildActionExecutionResult({
    actionType: 'tap',
    sourceModule: 'server',
    selector: { x: 1, y: 1 },
    success: true,
    uiFingerprintBefore: 'before',
    uiFingerprintAfter: 'after',
    details: { attempts: 3 },
    traceSteps
  })
  assert.deepStrictEqual(tracedResult.trace.steps, traceSteps)
  assert.strictEqual(tracedResult.trace.attempts, 3)

  console.log('server common tests passed')
}

try {
  run()
} catch (error) {
  console.error(error)
  process.exit(1)
}
