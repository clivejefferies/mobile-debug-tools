import { AsyncLocalStorage } from 'node:async_hooks'
import type { ActionConditionResult } from '../types.js'
import type { ExpectedState } from '../server/condition-schema.js'
import { ToolsObserve } from '../observe/index.js'
import { getSnapshotSessionId, hasSnapshotBaseline } from '../observe/snapshot-metadata.js'
import { runWithSeparateBudget } from '../utils/operation-budget.js'
import { ToolsNetwork } from '../network/index.js'

export interface ConditionalAction {
  platform: 'android' | 'ios'
  deviceId: string
  expected: ExpectedState
  result: ActionConditionResult
}

const context = new AsyncLocalStorage<ConditionalAction>()

export function createConditionalAction(platform: 'android' | 'ios', deviceId: string, expected: ExpectedState): ConditionalAction {
  return { platform, deviceId, expected, result: {
    status: 'not_checked',
    expected: { snapshot_session_id: expected.snapshotSessionId, snapshot_revision: expected.snapshotRevision },
    observed: null, elapsed_ms: 0, reason: 'ACTION_NOT_REACHED'
  } }
}

export function withConditionalAction<T>(condition: ConditionalAction, operation: () => Promise<T>) {
  return context.run(condition, operation)
}

export function isConditionBlocked() {
  const status = context.getStore()?.result.status
  return status === 'mismatch' || status === 'unavailable'
}

// Guarded calls reset the observation window only when input is about to spawn.
export function notifyActionStart() {
  if (!context.getStore()) ToolsNetwork.notifyActionStart()
}

export function conditionFailureCode(condition: ConditionalAction) {
  return condition.result.status === 'mismatch' ? 'PRECONDITION_FAILED' as const : 'PRECONDITION_UNAVAILABLE' as const
}

export async function beforeInputDispatch(platform: 'android' | 'ios', deviceId: string) {
  const condition = context.getStore()
  if (!condition) return
  const started = performance.now()
  const result = condition.result
  result.status = 'unavailable'
  delete result.reason
  try {
    if (platform !== condition.platform || deviceId !== condition.deviceId) result.reason = 'DEVICE_MISMATCH'
    else if (condition.expected.snapshotSessionId !== getSnapshotSessionId()) result.reason = 'SESSION_MISMATCH'
    else if (!hasSnapshotBaseline(`${platform}:${deviceId}`, condition.expected.snapshotRevision)) result.reason = 'BASELINE_UNAVAILABLE'
    else {
      const tree = await runWithSeparateBudget(condition.expected.timeoutMs ?? 15000, () =>
        ToolsObserve.getUITreeHandler({ platform, deviceId })) as any
      if (tree?.error) result.reason = 'OBSERVATION_FAILED'
      else if (!tree || !Array.isArray(tree.elements) || !Number.isSafeInteger(tree.snapshot_revision) || tree.snapshot_revision < 1 ||
          tree.snapshot_session_id !== getSnapshotSessionId() || !Number.isFinite(tree.captured_at_ms) || tree.captured_at_ms <= 0 ||
          !tree.resolution || !Number.isFinite(tree.resolution.width) || !Number.isFinite(tree.resolution.height) ||
          !(tree.resolution.width > 0) || !(tree.resolution.height > 0)) result.reason = 'OBSERVATION_INVALID'
      else if (tree.device?.platform !== platform || tree.device?.id !== deviceId) result.reason = 'DEVICE_MISMATCH'
      else {
        result.observed = tree
        result.status = tree.snapshot_revision === condition.expected.snapshotRevision ? 'matched' : 'mismatch'
      }
    }
  } catch (error) {
    result.reason = /TIMEOUT|timed out/i.test(String(error)) ? 'CONDITION_TIMEOUT' : 'OBSERVATION_FAILED'
  }
  result.elapsed_ms = performance.now() - started
  if (result.status !== 'matched') throw new Error(conditionFailureCode(condition))
  ToolsNetwork.notifyActionStart()
}
