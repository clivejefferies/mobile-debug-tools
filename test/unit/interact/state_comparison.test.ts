import assert from 'node:assert/strict'
import { compareReadableState } from '../../../src/interact/assertions/state-comparison.js'

assert.equal(compareReadableState('checked', true, { checked: true }).success, true)
const invalidBoolean = compareReadableState('checked', 'true', { checked: true })
assert.equal(invalidBoolean.success, false)
assert.equal(invalidBoolean.reason, 'expected checked must be boolean')
assert.equal(invalidBoolean.observedValue, true)
assert.equal(invalidBoolean.rawValue, null)
assert.equal(compareReadableState('value', 20, { value: '20' }).success, false, 'numeric assertions do not coerce readable strings')
assert.equal(compareReadableState('value', '20', { value: '20' }).success, true)
assert.equal(compareReadableState('selected', { id: 'dark' }, { selected: { id: 'dark', label: 'Dark' } }).success, true)
assert.equal(compareReadableState('selected', false, { selected: false }).success, true)
assert.equal(compareReadableState('selected', true, { selected: 'true' }).reason, 'selected state is not boolean')
assert.equal(compareReadableState('text_value', '', { text_value: '' }).reason, 'expected text_value must be string')
assert.equal(compareReadableState('value', 20, null).reason, 'value state unavailable')
const range = { min: 0, max: 20 }
assert.equal(compareReadableState('value_range', range, { value_range: range }).success, true, 'fallback comparison preserves reference equality')
assert.equal(compareReadableState('value_range', { min: 0, max: 20 }, { value_range: range }).success, false)
console.log('PASS readable-state comparison compatibility without UI or global mocks')
