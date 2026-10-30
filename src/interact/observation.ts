import type { GetUITreeResponse } from '../types.js'
import type { UiElement } from './model.js'

export type UiTree = Omit<Partial<GetUITreeResponse>, 'elements'> & { elements?: UiElement[] }
import type { DeviceTarget } from '../contracts/target.js'
export type { DeviceTarget } from '../contracts/target.js'
export type ObserveUI = (target: DeviceTarget) => Promise<UiTree>
