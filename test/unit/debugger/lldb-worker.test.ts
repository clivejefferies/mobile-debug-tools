import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./lldb-worker.py', import.meta.url))], { encoding: 'utf8', timeout: 15000 })
if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
  console.log('UNRUN optional LLDB Python worker checks: python3 is unavailable')
} else {
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  console.log(result.stdout.trim())
}
