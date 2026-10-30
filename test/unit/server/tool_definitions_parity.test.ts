import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { toolDefinitions } from '../../../src/server/tool-definitions.js'

// Captured before structural refactoring: changes require an intentional contract review.
const baseline = JSON.parse(await readFile(new URL('../../fixtures/contracts/tool-definitions.json', import.meta.url), 'utf8'))
assert.deepEqual(toolDefinitions, baseline, 'Public tool order, schemas, defaults and descriptions must remain compatible')
console.log('PASS public tool-definition compatibility baseline')
