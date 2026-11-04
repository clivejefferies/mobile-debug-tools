import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const exec = promisify(execFile)
const directory = await mkdtemp(path.join(os.tmpdir(), 'debugger-fake-lldb-'))
const python = path.join(directory, 'python')
const xcrun = path.join(directory, 'xcrun')
const log = path.join(directory, 'calls')
const failed = path.join(directory, 'failed')
try {
  await writeFile(xcrun, `#!${process.execPath}
const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},'xcrun\\n');
console.log(process.argv[2]==='lldb'?'/fake/lldb-python':${JSON.stringify(python)});
`, { mode: 0o700 })
  await writeFile(python, `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('-c')) {
 fs.appendFileSync(${JSON.stringify(log)},'probe\\n');
 if(!fs.existsSync(${JSON.stringify(failed)})){fs.writeFileSync(${JSON.stringify(failed)},'');process.exit(1)}
 console.log('ready');
} else {
 fs.appendFileSync(${JSON.stringify(log)},'worker\\n');
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
  const request=JSON.parse(line);console.log(JSON.stringify({id:request.id,result:{detached:true}}));
 });
}
`, { mode: 0o700 })
  const code = `
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Isolate platform emulation and native binaries from the unit runner process.
Object.defineProperty(process,'platform',{value:'darwin'});
const {prepareIOSWorker,createIOSWorker}=await import('./src/debugger/ios-worker.ts');
const first=prepareIOSWorker();assert.strictEqual(first,prepareIOSWorker());
const failed=await Promise.allSettled([first,prepareIOSWorker()]);
assert.ok(failed.every(result=>result.status==='rejected'));
const retry=prepareIOSWorker();assert.notStrictEqual(first,retry);
assert.strictEqual(retry,prepareIOSWorker());
const configuration=await retry;
assert.equal(configuration.python,${JSON.stringify(python)});
assert.equal(configuration.env.PYTHONPATH,'/fake/lldb-python');
assert.equal(configuration.env.PYTHONNOUSERSITE,'1');
assert.strictEqual(await prepareIOSWorker(),configuration);
const worker=await createIOSWorker(()=>{});await worker.close();
const calls=readFileSync(${JSON.stringify(log)},'utf8').trim().split('\\n');
assert.equal(calls.filter(call=>call==='xcrun').length,4);
assert.equal(calls.filter(call=>call==='probe').length,2);
assert.equal(calls.filter(call=>call==='worker').length,1);
console.log('PASS shared iOS preparation, failed-probe retry, configuration and worker cache reuse');
`
  const result = await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    env: { ...process.env, XCRUN_PATH: xcrun }, timeout: 15000
  })
  console.log(result.stdout.trim())
} finally { await rm(directory, { recursive: true, force: true }) }
