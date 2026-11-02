import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const exec = promisify(execFile)
const directory = await mkdtemp(path.join(os.tmpdir(), 'debugger-fake-jdk-'))
const secret = 'SECRET_COMPILER_OUTPUT'
const run = async () => {
  const code = `import {prepareWorker} from './src/debugger/worker.ts'; try {await prepareWorker(); process.exitCode=1} catch(e) {console.log(JSON.stringify({code:e.code,diagnostic:e.diagnostic}))}`
  const { stdout, stderr } = await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    env: { ...process.env, ANDROID_STUDIO_JDK: directory }, timeout: 10000
  })
  assert.ok(!stdout.includes(secret)); assert.ok(!stderr.includes(secret))
  return JSON.parse(stdout)
}
try {
  await mkdir(path.join(directory, 'bin'))
  const java = path.join(directory, 'bin', 'java')
  await writeFile(java, `#!${process.execPath}\nconsole.error('openjdk version "17.0.1"');`, { mode: 0o700 })
  await writeFile(path.join(directory, 'bin', 'javac'), `#!${process.execPath}\nconsole.error('${secret}');process.exit(1)`, { mode: 0o700 })
  const compile = await run()
  assert.equal(compile.code, 'DEBUGGER_UNSUPPORTED')
  assert.equal(compile.diagnostic.stage, 'compilation'); assert.equal(compile.diagnostic.reason, 'operation_failed')
  // Discovery succeeds; the actual bounded version subprocess then fails.
  await writeFile(java, `#!${process.execPath}\nconst fs=require('node:fs');const marker=${JSON.stringify(path.join(directory, 'seen'))};if(fs.existsSync(marker)){console.error('${secret}');process.exit(1)}fs.writeFileSync(marker,'');console.error('openjdk version "17.0.1"');`, { mode: 0o700 })
  const prerequisite = await run()
  assert.equal(prerequisite.code, 'DEBUGGER_ATTACH_FAILED')
  assert.equal(prerequisite.diagnostic.stage, 'prerequisite'); assert.equal(prerequisite.diagnostic.reason, 'unavailable')
} finally { await rm(directory, { recursive: true, force: true }) }
console.log('PASS isolated fake-JDK compilation/prerequisite classification without compiler output leakage')
