import type { UIElementState, ExpectStateResponse } from '../types.js';
type Expected = ExpectStateResponse['expected_state']['expected'];
type Observed = NonNullable<ExpectStateResponse['observed_state']>['value'];
export interface StateComparison {
  success: boolean;
  reason: string;
  rawValue: boolean | number | string | null;
  observedValue: Observed;
}
interface ComparisonInput {
  property: string;
  expected: Expected;
  actual: Observed;
  observedState: UIElementState | null;
}
const compareBoolean = (value: unknown) => typeof value === 'boolean' ? value : null;
const compareString = (value: unknown) => typeof value === 'string' ? value : null;
const compareNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function compareReadableState(property: string, expected: Expected, observedState: UIElementState | null): StateComparison {
  const input = { property, expected, observedState, actual: observedState?.[property as keyof UIElementState] ?? null };
  if (['checked', 'focused', 'expanded', 'enabled'].includes(property))
    return compareBooleanState(input);
  if (['value', 'raw_value'].includes(property))
    return compareValueState(input);
  if (property === 'selected')
    return compareSelectedState(input);
  if (property === 'text_value')
    return compareTextState(input);
  return compareOtherState(input);
}
function compareBooleanState({ property, expected, actual }: ComparisonInput): StateComparison {
  let success = false;
  let reason = '';
  let rawValue: StateComparison['rawValue'] = null;
  let observedValue: Observed = actual;
  const expectedBool = compareBoolean(expected);
  const actualBool = compareBoolean(actual);
  if (expectedBool === null) {
    reason = `expected ${property} must be boolean`;
  }
  else if (actualBool === null) {
    reason = `${property} state unavailable`;
  }
  else {
    rawValue = actualBool;
    success = actualBool === expectedBool;
    reason = success ? `${property} matches expected value` : `expected ${property}=${expectedBool} but observed ${actualBool}`;
  }
  observedValue = actualBool;
  return { success, reason, rawValue, observedValue };
}
function compareValueState({ expected, actual }: ComparisonInput): StateComparison {
  let success = false;
  let reason = '';
  let rawValue: StateComparison['rawValue'] = null;
  let observedValue: Observed = actual;
  const expectedNumber = compareNumber(expected);
  const actualNumber = compareNumber(actual);
  if (expectedNumber !== null && actualNumber !== null) {
    success = actualNumber === expectedNumber;
    rawValue = actualNumber;
    observedValue = actualNumber;
    reason = success ? 'value matches expected value' : `expected value=${expectedNumber} but observed ${actualNumber}`;
    return { success, reason, rawValue, observedValue };
  }
  const expectedString = typeof expected === 'string' ? expected : null;
  const actualString = compareString(actual);
  if (expectedString !== null && actualString !== null) {
    success = actualString === expectedString;
    rawValue = actualString;
    observedValue = actualString;
    reason = success ? 'value matches expected value' : `expected value=${expectedString} but observed ${actualString}`;
  }
  else {
    reason = 'value state unavailable';
  }
  return { success, reason, rawValue, observedValue };
}
function compareSelectedState({ expected, actual, observedState }: ComparisonInput): StateComparison {
  let success = false;
  let reason = '';
  let rawValue: StateComparison['rawValue'] = null;
  let observedValue: Observed = actual;
  const expectedBool = typeof expected === 'boolean' ? expected : null;
  const expectedString = typeof expected === 'string'
    ? expected
    : expected && typeof expected === 'object'
      ? String((expected as {
        id?: unknown;
        label?: unknown;
      }).id ?? (expected as {
        id?: unknown;
        label?: unknown;
      }).label ?? '')
      : null;
  if (!observedState || observedState.selected === undefined || observedState.selected === null) {
    reason = 'selected state unavailable';
    return { success, reason, rawValue, observedValue };
  }
  if (expectedBool !== null) {
    const actualBool = typeof observedState.selected === 'boolean' ? observedState.selected : null;
    if (actualBool === null) {
      reason = 'selected state is not boolean';
      return { success, reason, rawValue, observedValue };
    }
    rawValue = actualBool;
    observedValue = actualBool;
    success = actualBool === expectedBool;
    reason = success ? 'selected matches expected value' : `expected selected=${expectedBool} but observed ${actualBool}`;
    return { success, reason, rawValue, observedValue };
  }
  const actualSelected = typeof observedState.selected === 'object' && observedState.selected !== null
    ? String((observedState.selected as {
      id?: unknown;
      label?: unknown;
    }).id ?? (observedState.selected as {
      id?: unknown;
      label?: unknown;
    }).label ?? '')
    : String(observedState.selected);
  const actualString = actualSelected.trim();
  if (!expectedString) {
    reason = 'expected selected must be boolean, string, or object with id/label';
    return { success, reason, rawValue, observedValue };
  }
  rawValue = actualString;
  observedValue = actualString;
  success = actualString === expectedString;
  reason = success ? 'selected matches expected value' : `expected selected=${expectedString} but observed ${actualString}`;
  return { success, reason, rawValue, observedValue };
}
function compareTextState({ expected, actual }: ComparisonInput): StateComparison {
  let success = false;
  let reason = '';
  let rawValue: StateComparison['rawValue'] = null;
  let observedValue: Observed = actual;
  const expectedString = typeof expected === 'string' ? expected : null;
  const actualString = compareString(actual);
  if (!expectedString) {
    reason = 'expected text_value must be string';
  }
  else if (!actualString) {
    reason = 'text_value state unavailable';
  }
  else {
    success = actualString === expectedString;
    rawValue = actualString;
    observedValue = actualString;
    reason = success ? 'text_value matches expected value' : `expected text_value=${expectedString} but observed ${actualString}`;
  }
  return { success, reason, rawValue, observedValue };
}
function compareOtherState({ property, expected, actual }: ComparisonInput): StateComparison {
  let success = false;
  let reason = '';
  let rawValue: StateComparison['rawValue'] = null;
  let observedValue: Observed = actual;
  if (actual !== null && actual !== undefined) {
    success = actual === expected;
    observedValue = actual;
    rawValue = typeof actual === 'string' || typeof actual === 'number' || typeof actual === 'boolean' ? actual : null;
    reason = success ? `${property} matches expected value` : `expected ${property} to match but observed ${String(actual)}`;
  }
  else {
    reason = `unsupported or unavailable state property: ${property}`;
  }
  return { success, reason, rawValue, observedValue };
}
