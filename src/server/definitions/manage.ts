import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const manageTools: Tool[] = [
{
    name: 'start_app',
    description: `Purpose:
Launch a mobile app on Android or iOS.

Inputs:
- platform
- appId
- deviceId (optional)

Output Structure:
 - action_id, timestamp (ISO 8601), action_type
 - lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
 - source_module: runtime source of the action envelope
 - target.selector = { appId }
- success = true when launch was dispatched successfully
- failure_code/retryable when launch dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Define the expected landing screen when it is known
2. Call start_app
3. If needed, wait for transition using wait_for_*
4. Verify with expect_screen
5. If verification fails, retry once or capture a snapshot

Verification Guidance:
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- expect_screen is the authoritative verification step when the landing screen is known
- Do not treat timing or screen change alone as final verification

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → inspect snapshot/logs before retrying`,
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
        },
        verificationMode: { type: 'string', enum: ['none', 'light', 'full'], default: 'full' },
        responseMode: { type: 'string', enum: ['compact', 'debug'], default: 'debug' },
        actionTimeoutMs: { type: 'number', minimum: 100, maximum: 30000 },
        verificationTimeoutMs: { type: 'number', minimum: 100, maximum: 60000 }
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
    description: `Purpose:
Restart a mobile app on Android or iOS.

Inputs:
- platform
- appId
- deviceId (optional)

Output Structure:
 - action_id, timestamp (ISO 8601), action_type
 - lifecycle_state: post-dispatch lifecycle state (pending_verification or failed)
 - source_module: runtime source of the action envelope
 - target.selector = { appId }
- success = true when the restart command completed
- failure_code/retryable when restart dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Define the expected landing screen when it is known
2. Call restart_app
3. If needed, wait for transition using wait_for_*
4. Verify with expect_screen
5. If verification fails, retry once or capture a snapshot

Verification Guidance:
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- expect_screen is the authoritative verification step when the reopened screen is known
- Do not treat timing or screen change alone as final verification

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → inspect snapshot/logs before retrying`,
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
    name: 'list_devices',
    description: 'List connected devices and their metadata (android + ios).',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'] }
      }
    }
  }
]
