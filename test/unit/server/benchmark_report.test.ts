import assert from 'node:assert/strict'
import { summarize } from '../../device/automated/latency/report.js'
assert.equal(summarize([]), null)
assert.deepEqual(summarize([10, 1, 8, 2, 9, 3, 7, 4, 6, 5]), { count: 10, p50: 5, p95: 10, min: 1, max: 10 })
