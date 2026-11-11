import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { OwnedTransport } from '../../device/automated/latency/owned-transport.js'

if (process.platform !== 'win32') {
  // A stalled initialization with a stubborn child must time out, then both
  // processes must be gone. This uses real processes, not mocked kill calls.
  let childStarted = false
  const transport = new OwnedTransport(process.env, chunk => { childStarted ||= chunk.includes('ready') }, ['-e', `
    const {spawn}=require('node:child_process');
    process.on('SIGTERM',()=>{});
    const child=spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'],{stdio:'ignore'});
    child.on('spawn',()=>process.stderr.write('ready\\n'));
    setInterval(()=>{},1000);
  `])
  const client = new Client({ name: 'timeout-cleanup-test', version: '1' })
  try { await assert.rejects(client.connect(transport, { timeout: 500 }), /timed out/i) }
  finally { await transport.close() }
  assert.equal(childStarted, true)
  assert.equal(transport.cleanupVerified, true)
  // Interrupting a pending call takes the same owned-group cleanup path.
  const controller = new AbortController()
  const interrupted = new OwnedTransport(process.env, () => {}, ['-e', 'process.stdin.resume(); setInterval(()=>{},1000)'])
  const other = new Client({ name: 'interrupt-cleanup-test', version: '1' })
  const pending = other.connect(interrupted, { timeout: 5000, signal: controller.signal })
  await delay(50); controller.abort()
  await assert.rejects(pending)
  await interrupted.close()
  assert.equal(interrupted.cleanupVerified, true)
}
console.log('Owned benchmark timeout/interrupt cleanup: PASS')
