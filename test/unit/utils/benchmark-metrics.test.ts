import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const program = `
import assert from 'node:assert/strict';
import { withBenchmarkRequest, benchmarkStage } from './src/utils/benchmark-metrics.ts';
import { measure, withTiming } from './src/utils/timing.ts';
const values = {};
const result = await withBenchmarkRequest('outer', () => withTiming(values, async () => {
  await measure('dispatch_ms', () => benchmarkStage('subprocess_ms', async () => 1));
  return { unchanged: true };
}));
assert.deepEqual(result, { unchanged: true });
assert.ok(values.dispatch_ms >= 0);
await Promise.all(['first', 'second'].map(tool => withBenchmarkRequest(tool, () => benchmarkStage(tool, async () => tool))));
try { await withBenchmarkRequest('failure', async () => { throw Error('secret'); }); } catch {}
`
for (const enabled of ['0', '1']) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, MOBILE_DEBUG_MCP_LATENCY_METRICS: enabled }
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
  if (enabled === '0') assert.equal(result.stderr, '')
  else {
    const events = result.stderr.trim().split('\n').map(line => JSON.parse(line))
    assert.equal(events.length, 4)
    assert.equal(new Set(events.map(event => event.request_id)).size, 4)
    assert.deepEqual(events.find(event => event.tool === 'outer').spans.map((span: { stage: string }) => span.stage), ['subprocess_ms', 'dispatch_ms'])
    for (const tool of ['first', 'second']) assert.deepEqual(events.find(event => event.tool === tool).spans.map((span: { stage: string }) => span.stage), [tool])
    assert.equal(events.find(event => event.tool === 'failure').handler_completed, false)
    assert.ok(!result.stderr.includes('secret'))
  }
}
console.log('Opt-in latency metrics, failure and request isolation: PASS')
