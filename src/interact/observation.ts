import type { GetUITreeResponse } from '../types.js'
import type { UiElement } from './model.js'

export type UiTree = Omit<Partial<GetUITreeResponse>, 'elements'> & { elements?: UiElement[] }
export interface DeviceTarget { platform?: 'android' | 'ios'; deviceId?: string }
export type ObserveUI = (target: DeviceTarget) => Promise<UiTree>
