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
    step?: number | null;
  } | null;
  step?: number | null;
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
  semantic_role?: 'slider' | 'stepper' | 'dropdown' | 'segmented_control' | 'custom_adjustable' | 'composite_control' | null;
  supported_actions?: string[] | null;
  adjustable?: boolean | null;
  state_shape?: 'continuous' | 'discrete' | 'semantic' | null;
}

export interface LoadingState {
  active: boolean;
  signal: string;
  source: string;
}

export interface SnapshotDelta {
  previous_snapshot_revision: number | null;
  added_elements: number;
  removed_elements: number;
  mutated_elements: number;
  total_elements: number;
}

export interface StateDelta {
  base_snapshot_revision: number | null;
  snapshot_revision: number;
  added: UIElement[];
  removed: Array<{ stable_id?: string; resourceId?: string; contentDescription?: string; text?: string; index: number }>;
  changed: UIElement[];
  truncated: boolean;
  omitted_changes?: number;
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

export interface ReadinessSummary {
  state: 'loading' | 'transitioning' | 'settled' | 'unknown' | 'unresponsive' | 'debugger_paused';
  scope: 'device_ui';
  basis: 'observed' | 'heuristic' | 'insufficient';
  captured_at_ms: number | null;
  sample_count: number;
  stable_for_ms: number;
  snapshot_session_id: string | null;
  snapshot_revision: number | null;
  evidence: Array<{ code: string; source: string; captured_at_ms: number | null; snapshot_revision: number | null }>;
  limitations: string[];
  capabilities: { loading: boolean; transitioning: boolean; settled: boolean; unresponsive: boolean; debugger_paused: boolean };
}
