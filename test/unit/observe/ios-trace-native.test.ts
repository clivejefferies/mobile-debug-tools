import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { iosCapabilities, resolveIosApp } from '../../../src/observe/ios-trace/capabilities.js'
import { validateArtifact, validateToc, traceSize, IOS_TRACE_MAX_BYTES } from '../../../src/observe/ios-trace/artifact.js'
import { IosTraceNative } from '../../../src/observe/ios-trace/native.js'
import { spawnTrace, stopTraceChild, classifyTraceFailure, type TraceSpawn, type TraceCommandResult } from '../../../src/observe/ios-trace/process.js'
const app={app_id:'fixture',pid:123,executable:'/Fixture.app/Fixture',started_at:'Wed Nov 4 10:00:00 2026'}
const toc=(id='sim',pid=123,template='Time Profiler')=>`<trace-toc><run><info><target><device uuid="${id}"/><process pid="${pid}"/></target><summary><template-name>${template}</template-name></summary></info><processes><process pid="${pid}" path="/Fixture.app/Fixture"/></processes><data><table schema="time-sample"/></data></run></trace-toc>`
function fake(){
  const calls:{command:string;args:string[];signals:NodeJS.Signals[]}[]=[],lines:string[]=[]
  let mismatch=false,failExport=false,failReady=false
  const spawn:TraceSpawn=(command,args)=>{
    const call={command,args,signals:[] as NodeJS.Signals[]};calls.push(call)
    const recording=args.includes('record'),listener=command.endsWith('/notification'),pending=recording||listener
    let alive=pending,resolve!:(r:TraceCommandResult)=>void
    const done=new Promise<TraceCommandResult>(r=>{resolve=r})
    const execute=async()=>{
      let output=''
      if(args.includes('get_app_container'))output='/Fixture.app'
      else if(args.includes('launchctl'))output='123 0 UIKitApplication:fixture[abc]'
      else if(command==='/bin/ps')output=args.includes('lstart=')?app.started_at:mismatch?'/Other.app/Other':app.executable
      else if(args.includes('clang'))await fs.writeFile(args[args.indexOf('-o')+1],'binary')
      else if(args.includes('xcodebuild'))output='Xcode 27.2'
      else if(args.includes('templates'))output='== Standard Templates ==\nTime Profiler\nSystem Trace\nAnimation Hitches'
      else if(args.includes('xctrace')&&args.includes('devices'))output='fixture (sim)'
      else if(args.includes('devices'))output=JSON.stringify({devices:{'iOS-26-4':[{udid:'sim',state:'Booted',name:'fixture',isAvailable:true}]}})
      else if(args.includes('export')){
        if(failExport){resolve({code:2,output:'private stderr',timedOut:false});return}
        const file=args[args.indexOf('--output')+1]
        await fs.writeFile(file,args.includes('--toc')?toc():'<trace-query-result><node><schema name="time-sample"/><row><sample-time>1</sample-time></row></node></trace-query-result>')
      }
      if(!pending)resolve({code:0,output,timedOut:false})
    }
    void execute()
    return {done,alive:()=>alive,signal:s=>{call.signals.push(s);alive=false;resolve({code:0,output:'Stopped',timedOut:false})},line:async(line)=>{lines.push(line);if(failReady&&line==='READY')throw new Error('READINESS_TIMEOUT')}}
  }
  return {spawn,calls,lines,flags:(v:{mismatch?:boolean;export?:boolean;ready?:boolean})=>{mismatch=v.mismatch??false;failExport=v.export??false;failReady=v.ready??false}}
}
async function run(){
  const f=fake(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'ios-trace-unit-'))
  try{
    assert.deepEqual(await resolveIosApp('sim','fixture',f.spawn),app)
    f.flags({mismatch:true});await assert.rejects(()=>resolveIosApp('sim','fixture',f.spawn),/APP_IDENTITY_UNAVAILABLE/);f.flags({})
    const cap=await iosCapabilities('sim','fixture','Time Profiler',f.spawn,'darwin')
    assert.equal(cap.supported,true);assert.equal(cap.prerequisites.permissions,'unknown');assert.equal(cap.templates.filter(t=>t.supported).length,1)
    assert.equal((await iosCapabilities('sim',undefined,'System Trace',f.spawn,'darwin')).supported,false)
    assert.equal((await iosCapabilities('physical',undefined,'Time Profiler',f.spawn,'darwin')).supported,false)
    assert.equal((await iosCapabilities('sim',undefined,'Time Profiler',f.spawn,'linux')).reasons[0],'MACOS_REQUIRED')
    assert.ok(!f.calls.some(c=>c.args.includes('record')),'Discovery must not record')
    validateToc(toc(),'sim',app)
    assert.throws(()=>validateToc(toc(),'sim',{...app,executable:'/Other.app/Other'}),/ARTIFACT_APP_MISMATCH/)
    assert.equal(classifyTraceFailure({code:1,output:'secret path: permission denied',timedOut:false}),'PROFILING_PERMISSION_REQUIRED')
    assert.equal(classifyTraceFailure({code:1,output:'Cannot find process for provided pid: 123',timedOut:false}),'APP_NOT_RUNNING')
    for(const xml of [toc('other'),toc('sim',456),toc('sim',123,'System Trace'),'<invalid>'])assert.throws(()=>validateToc(xml,'sim',app))
    const file=path.join(directory,'capture.trace');await fs.mkdir(file);await fs.writeFile(path.join(file,'data'),'samples')
    const artifact=await validateArtifact(file,'sim',app,f.spawn)
    assert.equal(artifact.validation.sample_rows,1);assert.equal(artifact.kind,'directory');assert.equal((await fs.stat(path.join(file,'data'))).mode&0o777,0o600)
    await assert.rejects(()=>fs.stat(path.join(directory,'samples.xml')),{code:'ENOENT'})
    f.flags({export:true});await assert.rejects(()=>validateArtifact(file,'sim',app,f.spawn));f.flags({})
    const outside=path.join(directory,'link');await fs.symlink(file,outside);await assert.rejects(()=>traceSize(outside),/UNSAFE_ARTIFACT/)
    const huge=path.join(directory,'huge');await fs.writeFile(huge,'');await fs.truncate(huge,IOS_TRACE_MAX_BYTES+1)
    assert.ok(await traceSize(huge)>IOS_TRACE_MAX_BYTES)
    const native=new IosTraceNative(f.spawn)
    const recording=await native.start('sim',app,directory,30000,()=>{})
    assert.deepEqual(f.lines,['ARMED','READY'])
    const recorder=f.calls.find(c=>c.args.includes('record'))!,listener=f.calls.find(c=>c.command.endsWith('/notification'))!
    assert.equal(recorder.args[recorder.args.indexOf('--device')+1],'sim')
    assert.equal(recorder.args[recorder.args.indexOf('--attach')+1],'123')
    assert.equal(recorder.args[recorder.args.indexOf('--notify-tracing-started')+1],listener.args[0])
    assert.ok(!recorder.args.includes('--no-prompt'));await native.stop(recording);assert.deepEqual(recorder.signals,['SIGINT'])
    const failed=fake();failed.flags({ready:true});const other=new IosTraceNative(failed.spawn)
    await assert.rejects(()=>other.start('sim',app,directory,30000,()=>{}),/READINESS_TIMEOUT/)
    assert.ok(failed.calls.find(c=>c.args.includes('record'))?.signals.includes('SIGINT'))
    native.shutdown();other.shutdown()
    const child=spawnTrace(process.execPath,['-e','process.stdout.write("READY\\n");setInterval(()=>{},1000)'],2000)
    await child.line('READY',1000);await stopTraceChild(child,1000);assert.equal(child.alive(),false)
    const signals:NodeJS.Signals[]=[]
    const stuck={done:new Promise<TraceCommandResult>(()=>{}),alive:()=>true,line:async()=>{},signal:(s:NodeJS.Signals)=>{signals.push(s)}}
    await assert.rejects(()=>stopTraceChild(stuck,1),/ACTION_TIMEOUT/)
    assert.deepEqual(signals,['SIGINT','SIGKILL'])
    const noisy=await spawnTrace(process.execPath,['-e','process.stdout.write("x".repeat(100000))'],2000).done
    assert.equal(noisy.output.length,65536)
    const timeout=await spawnTrace(process.execPath,['-e','setInterval(()=>{},1000)'],30).done
    assert.equal(timeout.timedOut,true)
    console.log('PASS iOS native discovery, notification, ownership, artifact schemas and bounded children')
  }finally{await fs.rm(directory,{recursive:true,force:true})}
}
run().catch(error=>{console.error(error);process.exitCode=1})
