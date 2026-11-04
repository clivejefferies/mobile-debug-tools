import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IosTraceSessions } from '../../../src/observe/ios-trace/sessions.js'
import { IosTraceNative, type IosRecording } from '../../../src/observe/ios-trace/native.js'
import type { TraceClock } from '../../../src/observe/system-trace.js'
import type { TraceCommandResult } from '../../../src/observe/ios-trace/process.js'

const target = { platform: 'ios' as const, id: 'sim', simulator: true, osVersion: '26.4', model: 'fixture' }
function fixture() {
  let monitorTick = 0, exitOnMonitor = false, exportMessage = 'EXPORT_FAILED'
  let now = 1000, failStart = false, failStop = false, failExport = false, monitor = '', stops = 0, starts = 0, validations = 0
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>(), recordings: IosRecording[] = [], directories: string[] = []
  const time: TraceClock = { wall: () => now, mono: () => now, sleep: async ms => {now += ms},
    schedule: fn => { const id = {} as ReturnType<typeof setTimeout>; timers.set(id,fn); return id }, clear: id => {timers.delete(id)} }
  class Native extends IosTraceNative {
    resolve = async () => ({ app_id:'fixture', pid:100, executable:'/fixture.app/Fixture',started_at:'fixture-start' })
    async start(_d: string, _app: unknown, directory: string, _duration: number, own: (r: IosRecording) => void) {
      starts++; directories.push(directory)
      let alive = true, resolve!: (v: TraceCommandResult) => void
      const done = new Promise<TraceCommandResult>(r => {resolve=r})
      const recording: IosRecording = {file:path.join(directory,'capture.trace'), ready_at_ms:now,
        recorder:{done, alive:()=>alive, line:async()=>{},signal:()=>{alive=false;resolve({code:0,output:'Reached specified time limit',timedOut:false})}}}
      own(recording); recordings.push(recording)
      await fs.mkdir(recording.file)
      await fs.writeFile(path.join(recording.file,'data'),'sample')
      if(failStart) throw new Error('READINESS_TIMEOUT')
      return recording
    }
    async stop(r: IosRecording) {stops++; if(failStop) throw new Error('ACTION_TIMEOUT');r.recorder.signal('SIGINT');return r.recorder.done}
    async monitor(device: string, app: {pid:number;executable:string}, recording: IosRecording) {
      assert.equal(device,target.id);assert.equal(app.pid,100);assert.equal(app.executable,'/fixture.app/Fixture')
      assert.equal(recording,recordings.at(-1),'Retries must retain the same owned recording')
      now+=monitorTick
      if(exitOnMonitor)recording.recorder.signal('SIGINT')
      if(monitor)throw new Error(monitor)
    }
    async validate(r: IosRecording) {validations++;if(failExport)throw new Error(exportMessage);return {path:r.file,format:'instruments' as const,kind:'directory' as const,size_bytes:6,validation:{readable:true,schema:'time-sample',sample_rows:1}}}
    shutdown() {for(const r of recordings)r.recorder.signal('SIGINT')}
  }
  const sessions = new IosTraceSessions(new Native(),time)
  return {sessions,recordings,timers,flags:(v:{start?:boolean;stop?:boolean;export?:boolean;monitor?:string;monitorTick?:number;exitOnMonitor?:boolean;exportMessage?:string})=>{failStart=v.start??false;failStop=v.stop??false;failExport=v.export??false;monitor=v.monitor??'';monitorTick=v.monitorTick??0;exitOnMonitor=v.exitOnMonitor??false;exportMessage=v.exportMessage??'EXPORT_FAILED'},
    tick:(ms:number)=>{now+=ms},counts:()=>({stops,starts,validations}),
    cleanup:async()=>{await sessions.shutdown();for(const d of directories)await fs.rm(d,{recursive:true,force:true})}}
}
async function run() {
  const f=fixture()
  try {
    const start=await f.sessions.start(target,'fixture')
    await assert.rejects(()=>f.sessions.start(target,'fixture'),/TRACE_BUSY/)
    assert.equal(start.state,'recording');assert.equal(start.recording_ready_at_ms,1000)
    const finish=await f.sessions.link(start.trace_id,target,'journey')
    for(const device of [{platform:'android',id:'sim'},{platform:'ios',id:'other'}])await assert.rejects(()=>f.sessions.link(start.trace_id,device,'wrong'),/TRACE_NOT_FOUND/)
    const [a,b]=await Promise.all([f.sessions.control(start.trace_id,'stop'),f.sessions.control(start.trace_id,'stop')])
    assert.equal(a.state,'completed');assert.deepEqual(a,b);assert.deepEqual(a.correlation_ids,['journey']);assert.equal((await finish()).coverage,'partial')
    assert.equal(f.counts().validations,1)
    await assert.rejects(()=>f.sessions.link(start.trace_id,target,'stale'),/TRACE_NOT_FOUND/)
    await assert.rejects(()=>f.sessions.control('foreign','stop'),/TRACE_NOT_FOUND/)
    assert.equal((await f.sessions.control(start.trace_id,'cancel')).artifact?.path,a.artifact?.path)
    const cancelled=await f.sessions.start(target,'fixture')
    const dir=path.dirname(f.recordings[1].file)
    assert.equal((await f.sessions.control(cancelled.trace_id,'cancel')).state,'cancelled')
    await assert.rejects(()=>fs.stat(dir),{code:'ENOENT'})
    const expires=await f.sessions.start(target,'fixture',1000);f.tick(1001)
    const expired=await f.sessions.control(expires.trace_id,'status')
    assert.equal(expired.state,'completed');assert.equal(expired.completion_reason,'duration_limit')
    f.tick(600001);await assert.rejects(()=>f.sessions.control(start.trace_id,'status'),/TRACE_NOT_FOUND/)
  }finally{await f.cleanup()}
  for(const failure of ['start','stop','export','monitor'] as const){
    const f=fixture()
    try{
      if(failure==='start')f.flags({start:true})
      const s=await f.sessions.start(target,'fixture')
      if(failure==='start'){assert.equal(s.state,'failed');assert.equal(s.reason,'READINESS_TIMEOUT');assert.equal(s.cleanup.status,'complete');assert.equal(f.recordings[0].recorder.alive(),false);continue}
      f.flags(failure==='monitor'?{monitor:'STORAGE_LIMIT'}:{[failure]:true})
      const failed=await f.sessions.control(s.trace_id,failure==='monitor'?'status':'stop')
      assert.equal(failed.state,'failed');assert.equal(failed.artifact,null)
      if(failure==='monitor'){assert.equal(failed.reason,'STORAGE_LIMIT');assert.equal(failed.cleanup.status,'complete');continue}
      f.flags({})
      assert.equal((await f.sessions.control(s.trace_id,'stop')).state,'completed')
      assert.equal(f.counts().starts,1,'Retry must not start a new recording')
    }finally{await f.cleanup()}
  }
  const exportClassification=fixture()
  try {
    const s=await exportClassification.sessions.start(target,'fixture')
    exportClassification.flags({export:true,exportMessage:'COMMAND_FAILED'})
    const failed=await exportClassification.sessions.control(s.trace_id,'stop')
    assert.equal(failed.reason,'TRACE_ARTIFACT_FAILED','Monitor classification must not alter export errors')
    assert.match(failed.recovery!,/Retry stop/)
  }finally{await exportClassification.cleanup()}
  for(const reason of ['COMMAND_FAILED','ACTION_TIMEOUT','TARGET_DISCONNECTED','private unexpected output']) {
    const f=fixture()
    try {
      const s=await f.sessions.start(target,'fixture')
      f.flags({monitor:reason})
      for(let n=0;n<2;n++)assert.equal((await f.sessions.control(s.trace_id,'status')).state,'recording')
      assert.equal(f.counts().stops,0)
      f.flags({});assert.equal((await f.sessions.control(s.trace_id,'status')).state,'recording')
      f.flags({monitor:reason})
      for(let n=0;n<2;n++)assert.equal((await f.sessions.control(s.trace_id,'status')).state,'recording','Successful poll must reset consecutive failure count')
      const failed=await f.sessions.control(s.trace_id,'status')
      assert.equal(failed.state,'failed');assert.equal(failed.reason,reason==='private unexpected output'?'TRACE_MONITOR_FAILED':reason)
      assert.equal(failed.cleanup.status,'complete');assert.equal(failed.artifact,null)
      assert.equal(f.counts().starts,1);assert.equal(f.recordings[0].recorder.alive(),false)
      assert.ok(!JSON.stringify(failed).includes('private unexpected output'))
    }finally{await f.cleanup()}
  }
  for(const reason of ['APP_IDENTITY_CHANGED','APP_NOT_RUNNING']) {
    const f=fixture()
    try {
      const s=await f.sessions.start(target,'fixture');f.flags({monitor:reason})
      const failed=await f.sessions.control(s.trace_id,'status')
      assert.equal(failed.state,'failed');assert.equal(failed.reason,reason);assert.equal(failed.cleanup.status,'complete')
    }finally{await f.cleanup()}
  }
  for(const ended of ['deadline','recorder'] as const) {
    const f=fixture()
    try {
      const s=await f.sessions.start(target,'fixture',1000)
      f.flags({monitor:'COMMAND_FAILED',monitorTick:ended==='deadline'?1001:0,exitOnMonitor:ended==='recorder'})
      const result=await f.sessions.control(s.trace_id,'status')
      assert.equal(result.state,'completed','A tolerated failed poll must still reconcile duration/recorder completion')
      assert.equal(result.completion_reason,'duration_limit');assert.ok(result.artifact)
    }finally{await f.cleanup()}
  }
  const shutdown=fixture()
  try{const s=await shutdown.sessions.start(target,'fixture');assert.deepEqual(await shutdown.sessions.shutdown(),[]);assert.equal((await shutdown.sessions.control(s.trace_id,'status')).state,'cancelled');await assert.rejects(()=>shutdown.sessions.start(target,'fixture'),/TRACE_BUSY/)}finally{await shutdown.cleanup()}
  console.log('PASS iOS trace lifecycle, linkage, failure cleanup, retries and expiry')
}
run().catch(error=>{console.error(error);process.exitCode=1})
