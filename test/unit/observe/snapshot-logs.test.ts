import assert from 'node:assert/strict'
import { snapshotLog, streamLog } from '../../../src/observe/snapshot-logs.js'

const iso = '2026-10-30T12:00:00Z'
assert.deepEqual(snapshotLog({ timestamp: 123, message: 'warning', levelName: 'warn' }), { timestamp: 123, message: 'warning', level: 'WARN' })
assert.equal(streamLog({ timestamp: 123, message: 'warning' }).timestamp, null)
assert.equal(snapshotLog({ timestamp: 123, _iso: iso, msg: 'hello' }).timestamp, 123)
assert.equal(streamLog({ timestamp: 123, _iso: iso, msg: 'hello' }).timestamp, Date.parse(iso))
assert.equal(snapshotLog('FATAL EXCEPTION: crash').level, 'ERROR')
assert.equal(streamLog('WARN: slow').level, 'WARN')
assert.equal(snapshotLog({ timestamp: 'invalid', msg: 'hello' }).timestamp, null)
assert.deepEqual(snapshotLog(null), { timestamp: null, level: 'INFO', message: '' })
assert.equal(snapshotLog({ context: 'value' }).message, '{"context":"value"}')
console.log('Snapshot and stream timestamp precedence and log normalization tests passed')
