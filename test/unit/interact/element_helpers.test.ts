import assert from 'node:assert/strict'
import { _matchesSelector, _resolveActionableAncestor, _normalizeBounds } from '../../../src/interact/element-helpers.js'
import { _readNumericControlRange, _quantizeTargetValue } from '../../../src/interact/control-values.js'

assert(_matchesSelector({ text: 'Save', resourceId: 'app:id/save' }, { text: 'save', resource_id: 'app:id/save' }))
assert(!_matchesSelector({ text: 'Save', resourceId: 'app:id/other' }, { text: 'save', resource_id: 'app:id/save' }), 'all supplied selector fields constrain selection')
assert(_matchesSelector({ contentDesc: 'Save changes' }, { accessibility_id: 'changes', contains: true }))
assert(!_matchesSelector({ text: 'Save' }, undefined))
assert.deepEqual(_normalizeBounds(['1', 2, 3, 4]), [1, 2, 3, 4])
assert.equal(_normalizeBounds([1, 'invalid', 3, 4]), null)
const elements = [
  { id: 'parent', clickable: true, bounds: [0, 0, 100, 100] },
  { parentId: 'parent', text: 'Save', bounds: [20, 20, 40, 40] }
]
assert.deepEqual(_resolveActionableAncestor(elements, { el: elements[1], idx: 1 }), { el: elements[0], idx: 0 })
assert.deepEqual(_readNumericControlRange({ state: { value: '3 of 10' } }), { min: 0, max: 10 })
assert.equal(_readNumericControlRange({ state: { value_range: { min: 10, max: 0 } } }), null)
assert.equal(_quantizeTargetValue(0.26, 0, 1, 0.1), 0.3)
console.log('PASS injected-free selector, actionable ancestor, numeric range and snapping helpers')
