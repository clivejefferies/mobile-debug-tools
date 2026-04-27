export interface DeviceInfo {
  platform: string;
  id: string;
  osVersion: string;
  model: string;
  simulator: boolean;
}

export interface StartAppResponse {
  device: DeviceInfo;
  appStarted: boolean;
  launchTimeMs: number;
  output?: string;
  observedApp?: {
    appId: string;
    package?: string | null;
    activity?: string | null;
    screen?: string | null;
    pid?: number | null;
    matchedTarget?: boolean | null;
  };
  error?: string;
  diagnostics?: any;
}

export interface TerminateAppResponse {
  device: DeviceInfo;
  appTerminated: boolean;
  error?: string;
  diagnostics?: any;
}

export interface RestartAppResponse {
  device: DeviceInfo;
  appRestarted: boolean;
  launchTimeMs: number;
  output?: string;
  observedApp?: {
    appId: string;
    package?: string | null;
    activity?: string | null;
    screen?: string | null;
    pid?: number | null;
    matchedTarget?: boolean | null;
  };
  terminatedBeforeRestart?: boolean;
  terminateError?: string;
  error?: string;
  diagnostics?: any;
}

export interface ResetAppDataResponse {
  device: DeviceInfo;
  dataCleared: boolean;
  error?: string;
  diagnostics?: any;
}

export interface StructuredLogEntry {
  timestamp: string | null; // ISO string
  level: string; // VERBOSE, DEBUG, INFO, WARN, ERROR
  tag: string;
  pid: number | null;
  message: string;
}

export interface GetLogsResponse {
  device: DeviceInfo;
  logs: StructuredLogEntry[];
  logCount: number;
  // Source indicates the filtering method used: 'pid', 'package'/'process', or 'broad'
  source?: string;
  // Meta contains debugging information about how logs were collected and filters applied
  meta?: Record<string, any>;
}

export interface GetCrashResponse {
  device: DeviceInfo;
  crashes: string[];
}

export interface UIElementState {
  checked?: boolean | null;
  selected?: boolean | string | { id: string; label?: string } | null;
  focused?: boolean | null;
  expanded?: boolean | null;
  enabled?: boolean | null;
  text_value?: string | null;
  value?: number | string | null;
  raw_value?: number | string | null;
  value_range?: {
    min: number;
    max: number;
  } | null;
}

export interface SelectorConfidence {
  score: number;
  reason: string;
}

export interface UIResolutionSelector {
  value: string | null;
  confidence: SelectorConfidence | null;
}

export interface UIElementSemanticMetadata {
  is_clickable: boolean;
  is_container: boolean;
}

export interface LoadingState {
  active: boolean;
  signal: string;
  source: string;
}

export interface CaptureAndroidScreenResponse {
  device: DeviceInfo;
  screenshot: string; // base64 encoded string
  screenshot_mime?: string; // e.g. image/webp, image/jpeg, image/png
  screenshot_fallback?: string; // optional fallback base64 (e.g., jpeg)
  screenshot_fallback_mime?: string;
  resolution: {
    width: number;
    height: number;
  };
}

export interface CaptureIOSScreenshotResponse {
  device: DeviceInfo;
  screenshot: string; // base64 encoded string
  screenshot_mime?: string; // e.g. image/webp, image/jpeg, image/png
  screenshot_fallback?: string; // optional fallback base64 (e.g., jpeg)
  screenshot_fallback_mime?: string;
  resolution: {
    width: number;
    height: number;
  };
}

export interface UIElement {
  text: string | null;
  contentDescription: string | null;
  type: string;
  clickable: boolean;
  enabled: boolean;
  visible: boolean;
  bounds: [number, number, number, number];
  resourceId: string | null;
  parentId?: number;
  children?: number[];
  center?: [number, number];
  depth?: number;
  state?: UIElementState | null;
  stable_id?: string | null;
  role?: string | null;
  test_tag?: string | null;
  selector?: UIResolutionSelector | null;
  semantic?: UIElementSemanticMetadata | null;
}

export interface GetUITreeResponse {
  device: DeviceInfo;
  screen: string;
  resolution: {
    width: number;
    height: number;
  };
  elements: UIElement[];
  snapshot_revision: number;
  captured_at_ms: number;
  loading_state?: LoadingState | null;
  error?: string;
}

export interface GetCurrentScreenResponse {
  device: DeviceInfo;
  package: string;
  activity: string;
  shortActivity: string;
  error?: string;
}

export interface SnapshotSemanticResponse {
  screen: string | null;
  signals: Record<string, string | number | boolean> | null;
  actions_available: string[] | null;
  confidence: number;
  warnings: string[];
}

export interface CaptureDebugSnapshotRawResponse {
  timestamp: number;
  snapshot_revision: number;
  captured_at_ms: number;
  reason: string;
  activity: string | null;
  fingerprint: string | null;
  screenshot: string | null;
  ui_tree: GetUITreeResponse | null;
  logs: StructuredLogEntry[];
  loading_state?: LoadingState | null;
  device?: DeviceInfo;
  screenshot_error?: string;
  activity_error?: string;
  fingerprint_error?: string;
  ui_tree_error?: string;
  logs_error?: string;
}

export interface CaptureDebugSnapshotResponse {
  raw: CaptureDebugSnapshotRawResponse;
  semantic?: SnapshotSemanticResponse | null;
}

export interface WaitForElementResponse {
  device: DeviceInfo;
  found: boolean;
  element?: UIElement;
  error?: string;
}

export interface TapResponse {
  device: DeviceInfo;
  success: boolean;
  x: number;
  y: number;
  error?: string;
}

export type ActionFailureCode =
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'TIMEOUT'
  | 'NAVIGATION_NO_CHANGE'
  | 'AMBIGUOUS_TARGET'
  | 'STALE_REFERENCE'
  | 'UNKNOWN'

export interface ActionTargetResolved {
  elementId: string | null;
  text: string | null;
  resource_id: string | null;
  accessibility_id: string | null;
  class: string | null;
  bounds: [number, number, number, number] | null;
  index: number | null;
  state?: UIElementState | null;
  stable_id?: string | null;
  role?: string | null;
  test_tag?: string | null;
  selector?: UIResolutionSelector | null;
  semantic?: UIElementSemanticMetadata | null;
}

export interface ActionExecutionResult {
  action_id: string;
  timestamp: string;
  action_type: string;
  device?: DeviceInfo;
  target: {
    selector: Record<string, unknown> | null;
    resolved: ActionTargetResolved | null;
  };
  success: boolean;
  failure_code?: ActionFailureCode;
  retryable?: boolean;
  ui_fingerprint_before?: string | null;
  ui_fingerprint_after?: string | null;
  details?: Record<string, unknown>;
}

export interface TapElementResponse extends ActionExecutionResult {}

export interface ExpectScreenResponse {
  success: boolean;
  observed_screen: {
    fingerprint: string | null;
    screen: string | null;
  };
  expected_screen: {
    fingerprint: string | null;
    screen: string | null;
  };
  confidence: number;
  comparison: {
    basis: 'fingerprint' | 'screen' | 'none';
    matched: boolean;
    reason: string;
  };
}

export interface ExpectElementVisibleResponse {
  success: boolean;
  selector: {
    text?: string;
    resource_id?: string;
    accessibility_id?: string;
    contains?: boolean;
  };
  element_id: string | null;
  expected_condition?: 'visible';
  element?: ActionTargetResolved | null;
  observed?: {
    status?: string;
    matched_count?: number;
    condition_satisfied?: boolean;
    selected_index?: number | null;
    last_matched_element?: ActionTargetResolved | null;
  };
  reason?: string;
  failure_code?: 'TIMEOUT' | 'ELEMENT_NOT_FOUND' | 'UNKNOWN';
  retryable?: boolean;
}

export interface ExpectStateResponse {
  success: boolean;
  selector?: {
    text?: string;
    resource_id?: string;
    accessibility_id?: string;
    contains?: boolean;
  };
  element_id: string | null;
  expected_state: {
    property: string;
    expected: boolean | number | string | Record<string, unknown>;
  };
  element?: (ActionTargetResolved & { state?: UIElementState | null }) | null;
  observed_state?: {
    property: string;
    value: boolean | number | string | Record<string, unknown> | null;
    raw_value?: boolean | number | string | null;
  };
  reason?: string;
  failure_code?: 'ELEMENT_NOT_FOUND' | 'UNKNOWN';
  retryable?: boolean;
}

export interface WaitForUIChangeResponse {
  success: boolean;
  observed_change: 'hierarchy_diff' | 'text_change' | 'state_change' | null;
  snapshot_revision?: number;
  timeout: boolean;
  elapsed_ms: number;
  expected_change?: 'hierarchy_diff' | 'text_change' | 'state_change';
  reason?: string;
  loading_state?: LoadingState | null;
}

export interface SwipeResponse {
  device: DeviceInfo;
  success: boolean;
  start: [number, number];
  end: [number, number];
  duration: number;
  error?: string;
}

export interface TypeTextResponse {
  device: DeviceInfo;
  success: boolean;
  text: string;
  error?: string;
}

export interface PressBackResponse {
  device: DeviceInfo;
  success: boolean;
  error?: string;
}

export interface InstallAppResponse {
  device: DeviceInfo;
  installed: boolean;
  output?: string;
  error?: string;
  diagnostics?: any;
}
