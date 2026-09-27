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
  if (!budget || !Number.isFinite(budget.deadline)) return fallback
  const remaining = Math.floor(budget.deadline - performance.now())
  if (remaining <= 0) throw new Error('ACTION_TIMEOUT')
  return fallback > 0 ? Math.min(fallback, remaining) : remaining
}
export function markDispatchStarted() {
  remainingBudget()
  let budget = budgets.getStore()
  while (budget) { budget.dispatchStarted = true; budget = budget.parent }
}
