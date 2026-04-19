import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js'

import {
  StartAppResponse,
  TerminateAppResponse,
  RestartAppResponse,
  ResetAppDataResponse,
  InstallAppResponse
} from './types.js'

import { ToolsManage } from './manage/index.js'
import { ToolsInteract } from './interact/index.js'
import { ToolsObserve } from './observe/index.js'
import { AndroidManage } from './manage/index.js'
import { iOSManage } from './manage/index.js'
import { getSystemStatus } from './system/index.js'

export const serverInfo = {
  name: 'mobile-debug-mcp',
  version: '0.7.0'
}

export function wrapResponse<T>(data: T) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(data, null, 2)
    }]
  }
}

export const toolDefinitions = [
  {
    name: 'start_app',
    description: 'Launch a mobile app on Android or iOS simulator',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios']
        },
        appId: {
          type: 'string',
          description: 'Android package name or iOS bundle id'
        },
        deviceId: {
          type: 'string',
          description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.'
        }
      },
      required: ['platform', 'appId']
    }
  },
  {
    name: 'terminate_app',
    description: 'Terminate a mobile app on Android or iOS simulator',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios']
        },
        appId: {
          type: 'string',
          description: 'Android package name or iOS bundle id'
        },
        deviceId: {
          type: 'string',
          description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.'
        }
      },
      required: ['platform', 'appId']
    }
  },
  {
    name: 'restart_app',
    description: 'Restart a mobile app on Android or iOS simulator',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios']
        },
        appId: {
          type: 'string',
          description: 'Android package name or iOS bundle id'
        },
        deviceId: {
          type: 'string',
          description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.'
        }
      },
      required: ['platform', 'appId']
    }
  },
  {
    name: 'reset_app_data',
    description: 'Reset app data (clear storage) for a mobile app on Android or iOS simulator',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios']
        },
        appId: {
          type: 'string',
          description: 'Android package name or iOS bundle id'
        },
        deviceId: {
          type: 'string',
          description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.'
        }
      },
      required: ['platform', 'appId']
    }
  },
  {
    name: 'install_app',
    description: 'Install an app on Android or iOS. Accepts a built binary (apk/.ipa/.app) or a project directory to build then install. platform and projectType are required.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Platform to install to (required).' },
        projectType: { type: 'string', enum: ['native', 'kmp', 'react-native', 'flutter'], description: 'Project type to guide build/install tool selection (required).' },
        appPath: { type: 'string', description: 'Path to APK, .app, .ipa, or project directory' },
        deviceId: { type: 'string', description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.' }
      },
      required: ['platform', 'projectType', 'appPath']
    }
  },
  {
    name: 'build_app',
    description: 'Build a project for Android or iOS and return the built artifact path. Does not install. platform and projectType are required.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Platform to build for (required).' },
        projectType: { type: 'string', enum: ['native', 'kmp', 'react-native', 'flutter'], description: 'Project type to guide build tool selection (required).' },
        projectPath: { type: 'string', description: 'Path to project directory (contains gradlew or xcodeproj/xcworkspace)' },
        variant: { type: 'string', description: 'Optional build variant (e.g., Debug/Release)' }
      },
      required: ['platform', 'projectType', 'projectPath']
    }
  },
  {
    name: 'get_logs',
    description: 'Get recent logs from Android or iOS simulator. Returns device metadata and structured logs suitable for AI consumption.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios']
        },
        appId: {
          type: 'string',
          description: 'Filter by Android package name or iOS bundle id'
        },
        deviceId: {
          type: 'string',
          description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.'
        },
        pid: { type: 'number', description: 'Filter by process id' },
        tag: { type: 'string', description: 'Filter by tag (Android) or subsystem/category (iOS)' },
        level: { type: 'string', description: 'Log level filter (VERBOSE, DEBUG, INFO, WARN, ERROR)' },
        contains: { type: 'string', description: 'Substring to match in log message' },
        since_seconds: { type: 'number', description: 'Only return logs from the last N seconds' },
        limit: { type: 'number', description: 'Override default number of returned lines' },
        lines: {
          type: 'number',
          description: 'Legacy - number of log lines (android only)'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'list_devices',
    description: 'List connected devices and their metadata (android + ios).',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'] }
      }
    }
  },
  {
    name: 'get_system_status',
    description: 'Quick healthcheck of local mobile debugging environment (adb, devices, logs, env, iOS).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'capture_screenshot',
    description: 'Capture a screenshot from an Android device or iOS simulator. Returns device metadata and the screenshot image.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios']
        },
        deviceId: {
          type: 'string',
          description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'capture_debug_snapshot',
    description: 'Capture a complete debug snapshot (screenshot, ui tree, activity, fingerprint, logs). Returns structured JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Optional reason for snapshot' },
        includeLogs: { type: 'boolean', description: 'Whether to include logs', default: true },
        logLines: { type: 'number', description: 'Maximum number of log lines to include', default: 200 },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        appId: { type: 'string', description: 'Optional appId to scope logs (package/bundle id)' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' },
        sessionId: { type: 'string', description: 'Optional log stream session id to prefer' }
      }
    }
  },
  {
    name: 'start_log_stream',
    description: 'Start streaming logs for a target application on Android or iOS. For Android this uses adb logcat --pid=<pid>; for iOS it streams `xcrun simctl spawn <device> log stream` with a predicate.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], default: 'android' },
        packageName: { type: 'string', description: 'Android package name or iOS bundle id' },
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'], default: 'error' },
        deviceId: { type: 'string', description: 'Device Serial (Android) or UDID (iOS). Defaults to connected/booted device.' },
        sessionId: { type: 'string', description: 'Session identifier for the log stream' }
      },
      required: ['packageName']
    }
  },
  {
    name: 'read_log_stream',
    description: 'Read accumulated log stream entries for the active session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      }
    }
  },
  {
    name: 'stop_log_stream',
    description: 'Stop an active log stream for the session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      }
    }
  },
  {
    name: 'get_ui_tree',
    description: 'Get the current UI hierarchy from an Android device or iOS simulator. Returns a structured JSON representation of the screen content.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to get UI tree for'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial (Android) or UDID (iOS). Defaults to connected/booted device.'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'get_current_screen',
    description: 'Get the currently visible activity on an Android device. Returns package and activity name.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'Device Serial (Android). Defaults to connected/booted device.'
        }
      }
    }
  },
  {
    name: 'get_screen_fingerprint',
    description: 'Generate a stable fingerprint representing the current visible screen (activity + visible UI elements).',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' }
      }
    }
  },
  {
    name: 'wait_for_screen_change',
    description: 'Wait until the current screen fingerprint differs from a provided previousFingerprint. Useful to wait for navigation/animation completion.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        previousFingerprint: { type: 'string', description: 'The fingerprint to compare against (required)' },
        timeoutMs: { type: 'number', description: 'Timeout in ms to wait for change (default 5000)', default: 5000 },
        pollIntervalMs: { type: 'number', description: 'Polling interval in ms (default 300)', default: 300 },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' }
      },
      required: ['previousFingerprint']
    }
  },
  {
    name: 'wait_for_ui',
    description: 'Deterministic UI wait primitive. Waits for selector condition with retries and backoff.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resource_id: { type: 'string' },
            accessibility_id: { type: 'string' },
            contains: { type: 'boolean', description: 'When true, perform substring matching', default: false }
          }
        },
        condition: { type: 'string', enum: ['exists', 'not_exists', 'visible', 'clickable'], default: 'exists' },
        timeout_ms: { type: 'number', default: 60000 },
        poll_interval_ms: { type: 'number', default: 300 },
        match: { type: 'object', properties: { index: { type: 'number' } } },
        retry: { type: 'object', properties: { max_attempts: { type: 'number', default: 1 }, backoff_ms: { type: 'number', default: 0 } } },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      }
    }
  },
  {
    name: 'find_element',
    description: 'Find a UI element by semantic query (text, content-desc, resource-id, class). Returns best match.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (text or label)' },
        exact: { type: 'boolean', description: 'Require exact match (true/false)', default: false },
        timeoutMs: { type: 'number', description: 'Timeout in ms to keep searching', default: 3000 },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['query']
    }
  },
  {
    name: 'tap',
    description: 'Simulate a finger tap on the device screen at specific coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to tap on'
        },
        x: {
          type: 'number',
          description: 'X coordinate'
        },
        y: {
          type: 'number',
          description: 'Y coordinate'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'tap_element',
    description: 'Tap a previously resolved UI element using its elementId.',
    inputSchema: {
      type: 'object',
      properties: {
        elementId: {
          type: 'string',
          description: 'A unique element identifier returned by wait_for_ui'
        }
      },
      required: ['elementId']
    }
  },
  {
    name: 'swipe',
    description: 'Simulate a swipe gesture on an Android device.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to swipe on (android or ios)'
        },
        x1: { type: 'number', description: 'Start X coordinate' },
        y1: { type: 'number', description: 'Start Y coordinate' },
        x2: { type: 'number', description: 'End X coordinate' },
        y2: { type: 'number', description: 'End Y coordinate' },
        duration: { type: 'number', description: 'Duration in ms' },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      },
      required: ['x1', 'y1', 'x2', 'y2', 'duration']
    }
  },
  {
    name: 'scroll_to_element',
    description: 'Scroll the current screen until a target UI element becomes visible, then return its details.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Platform to operate on (required)' },
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resourceId: { type: 'string' },
            contentDesc: { type: 'string' },
            className: { type: 'string' }
          }
        },
        direction: { type: 'string', enum: ['down', 'up'], default: 'down' },
        maxScrolls: { type: 'number', default: 10 },
        scrollAmount: { type: 'number', default: 0.7 },
        deviceId: { type: 'string', description: 'Device UDID (iOS) or Serial (Android). Defaults to booted/connected.' }
      },
      required: ['platform', 'selector']
    }
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused input field on an Android device.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android'],
          description: 'Platform to type on (currently only android supported)'
        },
        text: {
          type: 'string',
          description: 'The text to type'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'press_back',
    description: 'Simulate pressing the Android Back button.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android'],
          description: 'Platform (currently only android supported)'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial/UDID. Defaults to connected/booted device.'
        }
      }
    }
  }
]

type ToolCallArgs = Record<string, unknown>
type ToolCallResult = Awaited<ReturnType<typeof wrapResponse>> | { content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> }
type ToolHandler = (args: ToolCallArgs) => Promise<ToolCallResult>

async function handleStartApp(args: ToolCallArgs) {
  const { platform, appId, deviceId } = args as any
  const res = await (platform === 'android' ? new AndroidManage().startApp(appId, deviceId) : new iOSManage().startApp(appId, deviceId))
  const response: StartAppResponse = {
    device: res.device,
    appStarted: res.appStarted,
    launchTimeMs: res.launchTimeMs
  }
  return wrapResponse(response)
}

async function handleTerminateApp(args: ToolCallArgs) {
  const { platform, appId, deviceId } = args as any
  const res = await (platform === 'android' ? new AndroidManage().terminateApp(appId, deviceId) : new iOSManage().terminateApp(appId, deviceId))
  const response: TerminateAppResponse = { device: res.device, appTerminated: res.appTerminated }
  return wrapResponse(response)
}

async function handleRestartApp(args: ToolCallArgs) {
  const { platform, appId, deviceId } = args as any
  const res = await (platform === 'android' ? new AndroidManage().restartApp(appId, deviceId) : new iOSManage().restartApp(appId, deviceId))
  const response: RestartAppResponse = { device: res.device, appRestarted: res.appRestarted, launchTimeMs: res.launchTimeMs }
  return wrapResponse(response)
}

async function handleResetAppData(args: ToolCallArgs) {
  const { platform, appId, deviceId } = args as any
  const res = await (platform === 'android' ? new AndroidManage().resetAppData(appId, deviceId) : new iOSManage().resetAppData(appId, deviceId))
  const response: ResetAppDataResponse = { device: res.device, dataCleared: res.dataCleared }
  return wrapResponse(response)
}

async function handleInstallApp(args: ToolCallArgs) {
  const { platform, projectType, appPath, deviceId } = args as any
  const res = await ToolsManage.installAppHandler({ platform, appPath, deviceId, projectType })
  const response: InstallAppResponse = {
    device: res.device,
    installed: res.installed,
    output: (res as any).output,
    error: (res as any).error
  }
  return wrapResponse(response)
}

async function handleBuildApp(args: ToolCallArgs) {
  const { platform, projectType, projectPath, variant } = args as any
  const res = await ToolsManage.buildAppHandler({ platform, projectPath, variant, projectType })
  return wrapResponse(res)
}

async function handleBuildAndInstall(args: ToolCallArgs) {
  const { platform, projectType, projectPath, deviceId, timeout } = args as any
  const res = await ToolsManage.buildAndInstallHandler({ platform, projectPath, deviceId, timeout, projectType })
  return {
    content: [
      { type: 'text' as const, text: res.ndjson },
      { type: 'text' as const, text: JSON.stringify(res.result, null, 2) }
    ]
  }
}

async function handleGetLogs(args: ToolCallArgs) {
  const { platform, appId, deviceId, pid, tag, level, contains, since_seconds, limit, lines } = args as any
  const res = await ToolsObserve.getLogsHandler({ platform, appId, deviceId, pid, tag, level, contains, since_seconds, limit, lines })
  const filtered = !!(pid || tag || level || contains || since_seconds || appId)
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ device: res.device, result: { count: res.logCount, filtered, crashLines: (res.crashLines || []), source: res.source, meta: res.meta || {} } }, null, 2) },
      { type: 'text' as const, text: JSON.stringify({ logs: res.logs }, null, 2) }
    ]
  }
}

async function handleListDevices(args: ToolCallArgs) {
  const { platform, appId } = args as any
  const res = await ToolsManage.listDevicesHandler({ platform, appId })
  return wrapResponse(res)
}

async function handleGetSystemStatus() {
  const result = await getSystemStatus()
  return wrapResponse(result)
}

async function handleCaptureScreenshot(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
  const res = await ToolsObserve.captureScreenshotHandler({ platform, deviceId })
  const mime = (res as any).screenshot_mime || 'image/png'
  const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [
    { type: 'text', text: JSON.stringify({ device: res.device, result: { resolution: (res as any).resolution, mimeType: mime } }, null, 2) },
    { type: 'image', data: (res as any).screenshot, mimeType: mime }
  ]
  if ((res as any).screenshot_fallback) {
    content.push({ type: 'text', text: JSON.stringify({ note: 'JPEG fallback included for compatibility', mimeType: (res as any).screenshot_fallback_mime || 'image/jpeg' }) })
    content.push({ type: 'image', data: (res as any).screenshot_fallback, mimeType: (res as any).screenshot_fallback_mime || 'image/jpeg' })
  }
  return { content }
}

async function handleCaptureDebugSnapshot(args: ToolCallArgs) {
  const { reason, includeLogs, logLines, platform, appId, deviceId, sessionId } = args as any
  const res = await ToolsObserve.captureDebugSnapshotHandler({ reason, includeLogs, logLines, platform, appId, deviceId, sessionId })
  return wrapResponse(res)
}

async function handleGetUITree(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
  const res = await ToolsObserve.getUITreeHandler({ platform, deviceId })
  return wrapResponse(res)
}

async function handleGetCurrentScreen(args: ToolCallArgs) {
  const { deviceId } = args as any
  const res = await ToolsObserve.getCurrentScreenHandler({ deviceId })
  return wrapResponse(res)
}

async function handleGetScreenFingerprint(args: ToolCallArgs) {
  const { platform, deviceId } = args as any
  const res = await ToolsObserve.getScreenFingerprintHandler({ platform, deviceId })
  return wrapResponse(res)
}

async function handleWaitForScreenChange(args: ToolCallArgs) {
  const { platform, previousFingerprint, timeoutMs, pollIntervalMs, deviceId } = args as any
  const res = await ToolsInteract.waitForScreenChangeHandler({ platform, previousFingerprint, timeoutMs, pollIntervalMs, deviceId })
  return wrapResponse(res)
}

async function handleWaitForUI(args: ToolCallArgs) {
  const { selector, condition = 'exists', timeout_ms = 60000, poll_interval_ms = 300, match, retry, platform, deviceId } = args as any
  const res = await ToolsInteract.waitForUIHandler({ selector, condition, timeout_ms, poll_interval_ms, match, retry, platform, deviceId })
  return wrapResponse(res)
}

async function handleFindElement(args: ToolCallArgs) {
  const { query, exact = false, timeoutMs = 3000, platform, deviceId } = args as any
  const res = await ToolsInteract.findElementHandler({ query, exact, timeoutMs, platform, deviceId })
  return wrapResponse(res)
}

async function handleTap(args: ToolCallArgs) {
  const { platform, x, y, deviceId } = args as any
  const res = await ToolsInteract.tapHandler({ platform, x, y, deviceId })
  return wrapResponse(res)
}

async function handleTapElement(args: ToolCallArgs) {
  const { elementId } = args as any
  const res = await ToolsInteract.tapElementHandler({ elementId })
  return wrapResponse(res)
}

async function handleSwipe(args: ToolCallArgs) {
  const { platform = 'android', x1, y1, x2, y2, duration, deviceId } = args as any
  const res = await ToolsInteract.swipeHandler({ platform, x1, y1, x2, y2, duration, deviceId })
  return wrapResponse(res)
}

async function handleScrollToElement(args: ToolCallArgs) {
  const { platform, selector, direction, maxScrolls, scrollAmount, deviceId } = args as any
  const res = await ToolsInteract.scrollToElementHandler({ platform, selector, direction, maxScrolls, scrollAmount, deviceId })
  return wrapResponse(res)
}

async function handleTypeText(args: ToolCallArgs) {
  const { text, deviceId } = args as any
  const res = await ToolsInteract.typeTextHandler({ text, deviceId })
  return wrapResponse(res)
}

async function handlePressBack(args: ToolCallArgs) {
  const { deviceId } = args as any
  const res = await ToolsInteract.pressBackHandler({ deviceId })
  return wrapResponse(res)
}

async function handleStartLogStream(args: ToolCallArgs) {
  const { platform, packageName, level, sessionId, deviceId } = args as any
  const res = await ToolsObserve.startLogStreamHandler({ platform, packageName, level, sessionId, deviceId })
  return wrapResponse(res)
}

async function handleReadLogStream(args: ToolCallArgs) {
  const { platform, sessionId, limit, since } = args as any
  const res = await ToolsObserve.readLogStreamHandler({ platform, sessionId, limit, since })
  return wrapResponse(res)
}

async function handleStopLogStream(args: ToolCallArgs) {
  const { platform, sessionId } = args as any
  const res = await ToolsObserve.stopLogStreamHandler({ platform, sessionId })
  return wrapResponse(res)
}

const toolHandlers: Record<string, ToolHandler> = {
  start_app: handleStartApp,
  terminate_app: handleTerminateApp,
  restart_app: handleRestartApp,
  reset_app_data: handleResetAppData,
  install_app: handleInstallApp,
  build_app: handleBuildApp,
  build_and_install: handleBuildAndInstall,
  get_logs: handleGetLogs,
  list_devices: handleListDevices,
  get_system_status: handleGetSystemStatus,
  capture_screenshot: handleCaptureScreenshot,
  capture_debug_snapshot: handleCaptureDebugSnapshot,
  get_ui_tree: handleGetUITree,
  get_current_screen: handleGetCurrentScreen,
  get_screen_fingerprint: handleGetScreenFingerprint,
  wait_for_screen_change: handleWaitForScreenChange,
  wait_for_ui: handleWaitForUI,
  find_element: handleFindElement,
  tap: handleTap,
  tap_element: handleTapElement,
  swipe: handleSwipe,
  scroll_to_element: handleScrollToElement,
  type_text: handleTypeText,
  press_back: handlePressBack,
  start_log_stream: handleStartLogStream,
  read_log_stream: handleReadLogStream,
  stop_log_stream: handleStopLogStream
}

export async function handleToolCall(name: string, args: ToolCallArgs = {}) {
  const handler = toolHandlers[name]
  if (!handler) throw new Error(`Unknown tool: ${name}`)

  try {
    return await handler(args)
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}` }]
    }
  }
}

export function createServer() {
  const server = new Server(
    serverInfo,
    {
      capabilities: {
        tools: {}
      }
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request: SchemaOutput<typeof CallToolRequestSchema>) => {
    const { name, arguments: args } = request.params
    return handleToolCall(name, args as Record<string, unknown>)
  })

  return server
}
