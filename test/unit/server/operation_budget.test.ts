import assert from 'node:assert/strict'
import { runWithBudget, remainingBudget, markDispatchStarted } from '../../../src/utils/operation-budget.js'
import { execCmd } from '../../../src/utils/exec.js'

async function run() {
  await runWithBudget(100, async budget => {
    assert.equal(budget.dispatchStarted, false)
    markDispatchStarted()
    assert.equal(budget.dispatchStarted, true)
    const response = await execCmd(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'])
    assert.equal(response.stderr, 'ACTION_TIMEOUT')
    assert.throws(() => remainingBudget(), /ACTION_TIMEOUT/)
  })
  await runWithBudget(1, async budget => {
    await new Promise(resolve => setTimeout(resolve, 5))
    assert.throws(() => markDispatchStarted(), /ACTION_TIMEOUT/)
    assert.equal(budget.dispatchStarted, false)
  })
}
run().catch(error => { console.error(error); process.exitCode = 1 })
