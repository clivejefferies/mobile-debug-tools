export const toolDefinitions = [
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
    description: `Purpose:
Restart a mobile app on Android or iOS.

Inputs:
- platform
- appId
- deviceId (optional)

Output Structure:
 - action_id, timestamp (ISO 8601), action_type
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
    description: 'Capture a complete debug snapshot (raw observation layer plus optional derived semantic layer). Returns structured JSON with snapshot_revision, captured_at_ms, and loading_state when detectable.',
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
    description: 'Get the current UI hierarchy from an Android device or iOS simulator. Returns a structured JSON representation of the screen content with snapshot metadata when available.',
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
    description: `Purpose:
Detect that a screen transition has occurred by waiting for the current fingerprint to differ from a previous fingerprint.

Capabilities:
- Synchronization for uncertain navigation timing
- Detection that something changed on screen

Constraints:
- Does not verify correctness of the resulting state
- Must not be used alone to confirm action success when an applicable expect_* tool exists
- Use classify_action_outcome + get_network_activity when the expected outcome is backend/API activity without a visible UI change

Recommended Usage:
1. Capture or define the expected outcome
2. Call an action tool
3. Use wait_for_screen_change when transition timing is uncertain
4. Follow with expect_screen when the expected destination is known`,
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
    name: 'wait_for_ui_change',
    description: `Purpose:
Wait for a non-navigation UI mutation or in-place update to become stable.

Inputs:
- expected_change (optional): hierarchy_diff, text_change, or state_change
- timeout_ms (optional)
- stability_window_ms (optional)

Guidance:
- Prefer wait_for_screen_change for navigation transitions.
- Prefer wait_for_ui_change for in-place mutations and non-navigation updates.
- Use the returned snapshot_revision as the observed synchronization point when available.

Failure Handling:
- TIMEOUT means the UI did not change in a stable way within the allotted time.`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' },
        expected_change: { type: 'string', enum: ['hierarchy_diff', 'text_change', 'state_change'], description: 'Optional type of UI change to wait for' },
        timeout_ms: { type: 'number', description: 'Timeout in ms to wait for change (default 60000)', default: 60000 },
        stability_window_ms: { type: 'number', description: 'How long the change must remain stable before success (default 250)', default: 250 }
      }
    }
  },
  {
    name: 'expect_screen',
    description: `Purpose:
Deterministically verify that the intended navigation outcome of an action has occurred.

Inputs:
- fingerprint: preferred exact-match screen fingerprint
- screen: exact semantic screen identifier when a fingerprint is not available

Output Structure:
- success: true when the expected screen matches the observed screen
- observed_screen: current fingerprint and screen identifier
- expected_screen: the expected fingerprint and/or screen identifier
- confidence: 1 for an exact match, otherwise 0

Recommended Usage:
1. Define the expected screen before executing the action
2. Resolve the target element or screen state
3. Call an action tool such as tap_element
4. If needed, wait for transition using wait_for_*
5. Call expect_screen as the final verification step
6. If success=false, treat the outcome as unverified and follow the action tool retry guidance

Verification Guidance:
- Primary and authoritative verification tool for navigation outcomes
- Prefer fingerprint whenever you have one
- Use screen only as a fallback exact match against known identifiers
- Works best when the expected screen identifier is known ahead of time
- If the expected screen is not already known, capture or define it before executing the action

Constraints:
- Returns structured binary success/failure only
- Must not rely on natural-language interpretation or reasoning

Failure Handling:
- success=false means the expected screen was not reached; retry or recover using the action tool's failure strategy`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override (android|ios)' },
        fingerprint: { type: 'string', description: 'Expected screen fingerprint. Preferred verification mechanism.' },
        screen: { type: 'string', description: 'Expected exact screen identifier when no fingerprint is available.' },
        deviceId: { type: 'string', description: 'Optional device id/udid to target' }
      }
    }
  },
  {
    name: 'expect_element_visible',
    description: `Purpose:
Deterministically verify that the intended UI outcome of an action has occurred by confirming a target element is visible.

Inputs:
- selector: required selector used to resolve the target element
- element_id: optional previously resolved element identifier used only as context

Output Structure:
- success: true when the element is visible
- selector: selector used for verification
- element_id: resolved element identifier when available
- element: minimal resolved element info when visible
- failure_code: TIMEOUT or UNKNOWN when verification fails
- retryable: true when failure_code=TIMEOUT

Recommended Usage:
1. Define the expected element state before executing the action
2. Resolve the target element or triggering control
3. Call an action tool such as tap_element
4. If needed, wait for UI availability using wait_for_*
5. Call expect_element_visible as the final verification step
6. If success=false, follow the action tool retry guidance

Verification Guidance:
- Primary and authoritative verification tool for expected element appearance or visibility
- Use this when the screen should stay the same but the UI should reveal or update a specific element
- selector is the primary input; element_id is an optional optimization only
- The tool resolves the selector internally when needed

Constraints:
- Returns structured binary success/failure only
- Must not rely on natural-language interpretation or reasoning

Failure Handling:
- TIMEOUT → retry verification once or retry the action after re-resolving
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resource_id: { type: 'string' },
            accessibility_id: { type: 'string' },
            contains: { type: 'boolean', default: false }
          }
        },
        element_id: { type: 'string', description: 'Optional previously resolved element identifier.' },
        timeout_ms: { type: 'number', default: 5000 },
        poll_interval_ms: { type: 'number', default: 300 },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['selector']
    }
  },
  {
    name: 'expect_state',
    description: `Purpose:
Verify a readable UI state property on the currently visible element.

Inputs:
- selector or element_id
- property
- expected
- platform/deviceId (optional)

Supported properties:
- checked, selected, focused, expanded, enabled, text_value, value, raw_value

Verification Guidance:
- Use this when the UI element is visible but its state must also be confirmed
- Prefer the canonical property names above
- The tool compares the normalized readable state and returns the observed value when available

Constraints:
- Returns structured success/failure only
- Does not infer a state when the property is unavailable

Failure Handling:
- ELEMENT_NOT_FOUND → re-resolve the element or wait for UI stabilization
- UNKNOWN → capture a snapshot and stop`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            resource_id: { type: 'string' },
            accessibility_id: { type: 'string' },
            contains: { type: 'boolean', default: false }
          }
        },
        element_id: { type: 'string', description: 'Optional previously resolved element identifier.' },
        property: { type: 'string', description: 'Readable state property to verify.' },
        expected: {
          description: 'Expected normalized state value.',
          oneOf: [
            { type: 'boolean' },
            { type: 'number' },
            { type: 'string' },
            { type: 'object' }
          ]
        },
        platform: { type: 'string', enum: ['android', 'ios'], description: 'Optional platform override' },
        deviceId: { type: 'string', description: 'Optional device serial/udid' }
      },
      required: ['property', 'expected']
    }
  },
  {
    name: 'wait_for_ui',
    description: `Purpose:
Resolve elements and/or detect that a UI transition or availability condition has occurred.

Capabilities:
- Deterministic element resolution
- Synchronization when element timing or availability is uncertain

Constraints:
- Does not verify correctness of the resulting state
- Must not be used alone to confirm action success when an applicable expect_* tool exists

Recommended Usage:
1. Use wait_for_ui to resolve an element before acting or to wait for UI readiness
2. Call the action tool
3. If the expected outcome is known, follow with expect_* as final verification`,
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
    description: `Purpose:
Dispatch a tap at specific screen coordinates.

Inputs:
- x, y coordinates
- platform (optional)
- deviceId (optional)

Output Structure:
 - action_id, timestamp (ISO 8601), action_type
- target.selector = { x, y }
- success = true when the tap was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Resolve coordinates deterministically
2. Call tap
3. If needed, wait for transition using wait_for_*
4. Verify with expect_screen or expect_element_visible depending on the intended outcome

Verification Guidance:
- Prefer tap_element over tap when an element can be resolved
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Use expect_screen for navigation and expect_element_visible for local UI changes
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → capture a snapshot and stop`,
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
    description: `Purpose:
Tap a previously resolved UI element using its elementId.

Inputs:
- elementId: a resolved UI element identifier returned by wait_for_ui

Output Structure:
- action_id: unique timestamp-based action identifier
- timestamp: ISO 8601 timestamp for the action attempt
- action_type: "tap_element"
- target.selector: original target handle ({ elementId })
- target.resolved: minimal resolved element info used for the tap
- success: true when the tap was dispatched
- failure_code: present when success=false
- retryable: present when failure_code exists
- ui_fingerprint_before/ui_fingerprint_after: optional fingerprints captured around the action

Recommended Usage:
1. Resolve the target with wait_for_ui or another deterministic resolver
2. Call tap_element
3. If needed, wait for transition using wait_for_*
4. Verify outcome using expect_*
   - use expect_screen when navigation is expected
   - use expect_element_visible when the UI change is local
5. If verification fails, inspect failure_code and follow the retry strategy below

Verification Guidance:
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Prefer expect_screen for navigation or modal transitions
- Prefer expect_element_visible when the tap should reveal or update a specific element
- wait_for_* may be used for resolution and synchronization, but not as the final verification step when an applicable expect_* tool exists
- Do not treat tap_element.success as outcome success; it only means the tap was executed

Failure Handling:
- STALE_REFERENCE → re-resolve the element, then retry
- ELEMENT_NOT_INTERACTABLE → wait or refine the target, then retry
- UNKNOWN → capture a snapshot and stop

This tool reports execution success only. Verification must be done with a separate expect_* tool.`,
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
    description: `Purpose:
Dispatch a swipe gesture on Android or iOS.

Inputs:
- start and end coordinates
- duration
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- target.selector = { x1, y1, x2, y2, duration }
- success = true when the swipe was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Determine swipe coordinates
2. Call swipe
3. If needed, wait for transition using wait_for_*
4. Verify with expect_screen or expect_element_visible when a deterministic outcome is expected

Verification Guidance:
- Swipe outcomes are less predictable; choose the most specific verifier available for the intended effect
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → capture a snapshot and stop`,
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
    description: `Purpose:
Scroll until a target element becomes visible.

Inputs:
- platform
- selector
- direction, maxScrolls, scrollAmount, deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- target.selector = original selector
- target.resolved = minimal resolved element info when found
- success = true when scrolling produced a visible target element
- failure_code/retryable when the target was not reached
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Resolve the target selector
2. Call scroll_to_element
3. If needed, wait for UI stabilization using wait_for_*
4. Verify with expect_element_visible when the expected element visibility is known
5. If success=false, follow failure handling before retrying

Verification Guidance:
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Use expect_element_visible when you need an explicit post-scroll confirmation
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- NAVIGATION_NO_CHANGE → adjust scroll direction or stop
- TIMEOUT → retry with refined selector or larger scroll budget
- UNKNOWN → capture a snapshot and stop`,
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
    description: `Purpose:
Type text into the currently focused Android input field.

Inputs:
- text
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- target.selector = { text }
- success = true when text input was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Resolve or focus the target input first
2. Call type_text
3. If needed, wait for UI stabilization using wait_for_*
4. Verify with expect_element_visible or expect_screen, depending on the intended outcome

Verification Guidance:
- Prefer verifying the next expected element or screen state instead of inferring success from the text action alone
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → re-focus the input or capture a snapshot`,
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
    description: `Purpose:
Dispatch the Android Back action.

Inputs:
- platform/deviceId (optional)

Output Structure:
- action_id, timestamp (ISO 8601), action_type
- target.selector = { key: "back" }
- success = true when the back action was dispatched
- failure_code/retryable when dispatch fails
- ui_fingerprint_before/ui_fingerprint_after when available

Recommended Usage:
1. Call press_back
2. If needed, wait for transition using wait_for_*
3. Verify with expect_screen when a known destination is expected
4. If verification fails, retry once or recover explicitly

Verification Guidance:
- Back outcomes can vary by screen, so verify against the intended destination when possible
- Follow RESOLVE → ACT → WAIT (if needed) → EXPECT
- Do not use wait_for_* alone as final verification when an applicable expect_* tool exists

Failure Handling:
- TIMEOUT → retry once
- UNKNOWN → capture a snapshot and stop`,
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
  },
  {
    name: 'classify_action_outcome',
    description: `Classify the outcome of the most recent action into exactly one of: success, no_op, backend_failure, ui_failure, unknown.

MUST be called after every action (tap, swipe, type_text, press_back, start_app, etc). Never skip.
Use this with get_network_activity when the expected outcome is backend/API activity without a visible UI change.
For backend/API activity, compare get_screen_fingerprint before and after the action and call get_network_activity immediately after the action instead of waiting for wait_for_screen_change.

HOW TO GATHER INPUTS before calling:
1. Call wait_for_screen_change or compare get_screen_fingerprint before/after — set uiChanged accordingly.
2. If you checked for a specific element with wait_for_ui, set expectedElementVisible.
3. Do NOT call get_network_activity yet — omit networkRequests on the first call.

RULES (applied in order — stop at first match):
1. If uiChanged=true OR expectedElementVisible=true → outcome=success
2. Otherwise this tool returns nextAction="call_get_network_activity" — you MUST call get_network_activity once, then call classify_action_outcome again with the results in networkRequests.
3. If any request has status=failure or retryable → outcome=backend_failure
4. If no requests returned → outcome=no_op
5. If all requests succeeded → outcome=ui_failure
6. Otherwise → outcome=unknown

BEHAVIOUR after outcome:
- success → continue
- no_op → retry the action once or re-resolve the element
- backend_failure → stop and report the failing endpoint
- ui_failure → stop and report failure
- unknown → take one recovery step (e.g. capture_debug_snapshot), then stop`,
    inputSchema: {
      type: 'object',
      properties: {
        uiChanged: {
          type: 'boolean',
          description: 'true if the screen fingerprint or activity changed after the action. Use wait_for_screen_change or compare get_screen_fingerprint before and after.'
        },
        expectedElementVisible: {
          type: 'boolean',
          description: 'true if the element you expected to appear is now visible (from wait_for_ui). Omit if you did not check for a specific element.'
        },
        networkRequests: {
          type: 'array',
          description: 'Pass this only after calling get_network_activity as instructed by nextAction. Also use it when the expected outcome is backend/API activity without a visible UI change.',
          items: {
            type: 'object',
            properties: {
              endpoint: { type: 'string', description: 'Request endpoint or full URL' },
              status: { type: 'string', enum: ['success', 'failure', 'retryable'], description: 'Outcome of the request' }
            },
            required: ['endpoint', 'status']
          }
        },
        hasLogErrors: {
          type: 'boolean',
          description: 'true if structured log errors were observed (e.g. from read_log_stream). Optional — include if you have already read logs.'
        }
      },
      required: ['uiChanged']
    }
  },
  {
    name: 'get_network_activity',
    description: `Returns structured network events captured from platform logs since the last action.

Call this when classify_action_outcome returns nextAction="call_get_network_activity" or immediately after an action whose expected outcome is backend/API activity without a visible UI change.
Do not call more than once per action.

Events are filtered to significant (non-background) requests only.
Each event includes endpoint, method, statusCode, networkError, status, and durationMs.

status values:
- success: HTTP 2xx or request detected with no error signal
- failure: HTTP 4xx
- retryable: HTTP 5xx, network error (timeout, dns_error, tls_error, etc.)

Returns { requests: [], count: 0 } when no credible network signals are found.`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'Platform to read network logs from'
        },
        deviceId: {
          type: 'string',
          description: 'Device Serial (Android) or UDID (iOS). Defaults to connected/booted device.'
        }
      },
      required: ['platform']
    }
  }
]
