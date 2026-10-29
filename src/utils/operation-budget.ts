import { AsyncLocalStorage } from 'node:async_hooks'

export interface OperationBudget { deadline: number; dispatchStarted: boolean; parent?: OperationBudget }
const budgets = new AsyncLocalStorage<OperationBudget>()
export function hasFiniteBudget() { return Number.isFinite(budgets.getStore()?.deadline) }
export function runWithBudget<T>(timeoutMs: number, operation: (budget: OperationBudget) => Promise<T>) {
  const parent = budgets.getStore()
  const budget = { deadline: Math.min(parent?.deadline ?? Infinity, performance.now() + timeoutMs), dispatchStarted: false, parent }
  return budgets.run(budget, () => operation(budget))
}
export function remainingBudget(fallback = 0): number {
  const budget = budgets.getStore()
  let deadline = budget?.deadline ?? Infinity
  for (let ancestor = budget?.parent; ancestor; ancestor = ancestor.parent) deadline = Math.min(deadline, ancestor.deadline)
  if (!Number.isFinite(deadline)) return fallback
  const remaining = Math.floor(deadline - performance.now())
  if (remaining <= 0) throw new Error('ACTION_TIMEOUT')
  return fallback > 0 ? Math.min(fallback, remaining) : remaining
}

// Pause only this action's budget. Any enclosing operation still bounds the read.
export async function runWithSeparateBudget<T>(timeoutMs: number, operation: () => Promise<T>): Promise<T> {
  remainingBudget()
  const action = budgets.getStore()
  const started = performance.now()
  const parent = action?.parent
  const budget: OperationBudget = { deadline: Math.min(parent?.deadline ?? Infinity, started + timeoutMs), dispatchStarted: false, parent }
  try {
    return await budgets.run(budget, async () => {
      const result = await operation()
      remainingBudget()
      return result
    })
  } finally {
    if (action) action.deadline += performance.now() - started
  }
}
export function markDispatchStarted() {
  remainingBudget()
  let budget = budgets.getStore()
  while (budget) { budget.dispatchStarted = true; budget = budget.parent }
}
