import { systemTraces, TraceError } from '../../observe/system-trace.js'
import { traceTargetSchema, traceStartSchema, traceControlSchema } from '../schemas/system-trace-schema.js'
import { resolveTargetDevice } from '../../utils/resolve-device.js'

import { ToolsManage } from '../../manage/index.js'
import { classifyActionOutcome } from '../../interact/classify.js'
import { ToolsNetwork } from '../../observe/network/index.js'
import { getSystemStatus } from '../../system/index.js'
import {
  getArrayArg,
  getBooleanArg,
  getStringArg,
  requireBooleanArg,
  requireStringArg,
  ToolCallArgs,
  wrapResponse
} from '../common.js'
import type { PlatformArg, ClassifyNetworkRequestArg } from './handler-types.js'

export async function handleListDevices(args: ToolCallArgs) {
  const platform = getStringArg(args, 'platform') as PlatformArg | undefined
  const appId = getStringArg(args, 'appId')
  const res = await ToolsManage.listDevicesHandler({ platform, appId })
  return wrapResponse(res)
}

export async function handleGetSystemStatus() {
  const result = await getSystemStatus()
  return wrapResponse(result)
}

export function handleClassifyActionOutcome(args: ToolCallArgs) {
  const uiChanged = requireBooleanArg(args, 'uiChanged')
  const expectedElementVisible = getBooleanArg(args, 'expectedElementVisible')
  const actionType = getStringArg(args, 'actionType')
  const networkRequests = getArrayArg<ClassifyNetworkRequestArg>(args, 'networkRequests')
  const hasLogErrors = getBooleanArg(args, 'hasLogErrors')
  const result = classifyActionOutcome({
    uiChanged,
    expectedElementVisible: expectedElementVisible ?? null,
    actionType: actionType ?? null,
    networkRequests: networkRequests ?? null,
    hasLogErrors: hasLogErrors ?? null
  })
  return Promise.resolve(wrapResponse(result))
}

export async function handleGetNetworkActivity(args: ToolCallArgs) {
  const platform = requireStringArg(args, 'platform') as PlatformArg
  const deviceId = getStringArg(args, 'deviceId')
  const result = await ToolsNetwork.getNetworkActivity({ platform, deviceId })
  return wrapResponse(result)
}

export async function handleSystemTrace(name: string, args: ToolCallArgs) {
  const schema = name === 'start_system_trace' ? traceStartSchema : name === 'get_system_trace_capabilities' ? traceTargetSchema : traceControlSchema
  const parsed = schema.safeParse(args)
  if (!parsed.success) throw new TraceError('INVALID_ARGUMENT')
  if (name === 'get_system_trace_capabilities' || name === 'start_system_trace') {
    const target = parsed.data as { platform: PlatformArg; deviceId?: string; durationMs?: number }
    if (target.platform !== 'android') {
      if (name === 'start_system_trace') throw new TraceError('UNSUPPORTED_PLATFORM')
      return wrapResponse({ supported: false, backend: 'perfetto', device: null, prerequisites: {}, reasons: ['UNSUPPORTED_PLATFORM'], enabled_sources: [], unavailable_categories: [], limitations: ['Android only'] })
    }
    let device
    try { device = await resolveTargetDevice(target) }
    catch {
      if (name === 'start_system_trace') throw new TraceError('TRACE_UNSUPPORTED')
      return wrapResponse({ supported: false, backend: 'perfetto', device: null, prerequisites: { device: false }, reasons: ['DEVICE_UNAVAILABLE'], enabled_sources: [], unavailable_categories: [], limitations: ['An authorised Android device is required'] })
    }
    if (name === 'get_system_trace_capabilities') return wrapResponse(await systemTraces.capabilities(device.id))
    const result = await systemTraces.start(device.id, target.durationMs)
    return { ...wrapResponse(result), ...(result.state === 'failed' ? { isError: true } : {}) }
  }
  const operation = name === 'stop_system_trace' ? 'stop' : name === 'cancel_system_trace' ? 'cancel' : 'status'
  const result = await systemTraces.control((parsed.data as { traceId: string }).traceId, operation)
  return { ...wrapResponse(result), ...(['failed', 'cancelled'].includes(result.state) ? { isError: true } : {}) }
}

