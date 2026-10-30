import type { AndroidInteract } from './android.js'
import type { ActionTargetResolved, DeviceInfo } from '../types.js'

type AdjustmentResult = { success?: boolean; device?: DeviceInfo; error?: string }
type AdjustmentTarget = { deviceId: string; target: ActionTargetResolved | null; property: string }

/** Common native input surface, with optional semantic control capabilities. */
export type InputService = Pick<AndroidInteract, 'tap' | 'swipe' | 'scrollToElement'> & {
  setAdjustableValue?(input: AdjustmentTarget & { value: number }): Promise<AdjustmentResult>
  adjustAccessibleValue?(input: AdjustmentTarget & { direction: 'increment' | 'decrement' }): Promise<AdjustmentResult>
}
