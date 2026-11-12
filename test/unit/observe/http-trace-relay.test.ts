import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { HttpTraceRelay } from '../../../src/observe/http-trace/relay.js'

function frame(id: number, size: number): Buffer {
  const bytes = Buffer.alloc(8)
  bytes.writeInt32BE(id, 0)
  bytes.writeInt32BE(size, 4)
  return bytes
}

{
  const input = new PassThrough()
  const output = new PassThrough()
  const relay = new HttpTraceRelay(input, output, '/unused.sock')
  const ready = frame(0, 41234)
  input.write(ready.subarray(0, 3))
  input.write(ready.subarray(3))
  assert.equal(await relay.port, 41234)
  relay.close()
  await relay.closed
  assert(output.writableEnded)
  assert(input.destroyed)
}

for (const invalid of [frame(-1, 1), frame(1, 8193), frame(0, 70000), frame(1, -1)]) {
  const input = new PassThrough()
  const relay = new HttpTraceRelay(input, new PassThrough(), '/unused.sock')
  const rejected = Promise.all([
    assert.rejects(relay.port, /closed before readiness/),
    assert.rejects(relay.closed, /Invalid|Unexpected/),
  ])
  input.end(invalid)
  await rejected
}

{
  const input = new PassThrough()
  const relay = new HttpTraceRelay(input, new PassThrough(), '/unused.sock')
  const rejected = assert.rejects(relay.closed, /Incomplete/)
  input.write(frame(0, 41234))
  await relay.port
  input.end(frame(1, 8))
  await rejected
}

console.log('HTTP trace relay handshake, framing and shutdown: PASS')
