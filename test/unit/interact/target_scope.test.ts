import assert from 'node:assert/strict'
import { ResolvedElements } from '../../../src/interact/resolved-elements.js'
import { findScopedElement, resolveUiChangeScope } from '../../../src/interact/target-scope.js'
import type { ResolvedUiElementContext } from '../../../src/interact/model.js'

const store = new ResolvedElements(2)
const context = (id: string): ResolvedUiElementContext => ({
  elementId: id, platform: 'android', deviceId: 'fixture', bounds: null, index: 0, stable_id: id
})
store.remember('one', context('one'))
store.remember('two', context('two'))
store.remember('one', context('one'))
store.remember('three', context('three'))
assert.equal(store.get('two'), undefined, 'oldest handle is evicted; refresh updates insertion order')
assert(store.get('one'))
const tree = { elements: [{ text: 'Root', stable_id: 'one', children: [1] }, { text: 'Child', parentId: 0 }] }
const match = findScopedElement(tree, 'one', store)
assert.equal(match?.index, 0)
assert.equal(match?.reason, 'stable_id_match')
let calls = 0
const subtree = resolveUiChangeScope(tree, 'subtree', 'custom-handle', (_tree, id) => {
  calls++
  assert.equal(id, 'custom-handle')
  return { index: 0, stableId: 'one', reason: 'injected_lookup' }
})
assert.equal(calls, 1)
assert.equal(subtree.elements.length, 2)
assert.equal(subtree.resolution.reason, 'injected_lookup')
assert.equal(resolveUiChangeScope(tree, 'subtree', '', () => { throw new Error('must not resolve empty targets') }).error?.code, 'INVALID_SCOPE')
assert.equal(resolveUiChangeScope(tree, 'subtree', 'missing', () => null).error?.code, 'ELEMENT_NOT_FOUND')
const other = new ResolvedElements(2)
assert.equal(other.get('one'), undefined, 'resolution stores do not share process-global state')
store.clear()
assert.equal(store.get('one'), undefined)
console.log('PASS bounded handle retention and injected subtree resolution without static replacements')
