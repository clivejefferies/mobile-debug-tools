import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const observeTools: Tool[] = [
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
    description: 'Capture a complete debug snapshot (raw observation layer plus optional derived semantic layer). Returns structured JSON with snapshot_revision, captured_at_ms, snapshot_delta, and loading_state when detectable.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Optional reason for snapshot' },
        includeLogs: { type: 'boolean', description: 'Whether to include logs', default: true },
        includeScreenshot: { type: 'boolean', description: 'Whether to collect screenshot bytes', default: true },
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
    description: 'Get the current UI hierarchy from an Android device or iOS simulator. Returns a structured JSON representation of the screen content with snapshot metadata and incremental delta signals when available.',
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
        },
        responseMode: { type: 'string', enum: ['compact', 'debug'], default: 'debug' },
        sinceSnapshotRevision: { type: 'number', minimum: 1 }
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
  }
]
