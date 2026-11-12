import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = await mkdtemp(join(tmpdir(), 'mdm-ht-backend-'))
try {
  const unpatched = join(directory, 'mockttp.cjs')
  const marker = join(directory, 'backend-started')
  await writeFile(unpatched, `exports.getLocal = () => ({
    start() { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected'); }
  });`)
  const worker = fork(fileURLToPath(new URL('../../../src/observe/http-trace/backend.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, MCP_HTTP_TRACE_MOCKTTP_MODULE: unpatched },
  })
  const closed = once(worker, 'close', { signal: AbortSignal.timeout(8000) })
  try {
    worker.send({ socketPath: join(directory, 'trace.sock'), hosts: ['test.local'] })
    assert.equal((await closed)[0], 1)
    await assert.rejects(stat(marker), { code: 'ENOENT' })
  } finally { worker.kill() }
} finally { await rm(directory, { recursive: true, force: true }) }

console.log('HTTP trace refuses an unpatched backend before it starts a listener: PASS')
