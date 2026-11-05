import { verifyIosTraceShutdown } from '../../../helpers/ios-trace-shutdown.js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildReadinessFixture, readinessAppId } from '../../../fixtures/readiness-app/build.js'

const inputEnvironment = () => Object.fromEntries(['IDB_COMPANION','MCP_IDB_PATH','IDB_PATH','XCRUN_PATH'].flatMap(key=>process.env[key]?[[key,process.env[key]!]]:[]))
async function run() {
  const deviceId=process.env.IOS_SYSTEM_TRACE_DEVICE
  if(process.env.SKIP_DEVICE_TESTS==='1'||!deviceId){console.log('iOS system trace smoke: UNRUN (set IOS_SYSTEM_TRACE_DEVICE to an explicit simulator UDID)');return}
  assert.equal(process.platform,'darwin')
  const command=(args:string[])=>execFileSync('xcrun',args,{encoding:'utf8',timeout:120000,stdio:'pipe'})
  const sims=JSON.parse(command(['simctl','list','devices','--json']))
  const device=Object.values(sims.devices).flat().find((d:any)=>d.udid===deviceId) as any
  assert.ok(device?.isAvailable,'Explicit available simulator required')
  let booted=false,installed=false,fixture:ReturnType<typeof buildReadinessFixture>|undefined
  const client=new Client({name:'ios-system-trace-smoke',version:'1.0.0'})
  const transport=new StdioClientTransport({command:process.execPath,args:['dist/server.js'],stderr:'pipe',env:inputEnvironment()})
  const owned=new Set<string>(),artifacts:string[]=[],checks:Record<string,unknown>={}
  let journeyFailure: Error | undefined
  const target={platform:'ios',deviceId},traceTarget={...target,appId:readinessAppId}
  const call=async(name:string,args:Record<string,unknown>)=>{
    const result=await client.callTool({name,arguments:args},undefined,{timeout:180000})
    return JSON.parse((result.content as any[]).find(c=>c.type==='text').text)
  }
  const start=async(durationMs=90000)=>{
    const r=await call('start_system_trace',{...traceTarget,durationMs})
    if(r.trace_id&&r.cleanup?.status!=='complete')owned.add(r.trace_id)
    assert.equal(r.state,'recording',JSON.stringify(r));assert.ok(r.recording_ready_at_ms>=r.capture_started_at_ms)
    return r
  }
  const stop=async(id:string)=>{
    const r=await call('stop_system_trace',{traceId:id})
    if(r.artifact)artifacts.push(r.artifact.path)
    assert.equal(r.state,'completed',JSON.stringify(r));assert.equal(r.cleanup.status,'complete')
    assert.equal(r.artifact.validation.readable,true);owned.delete(id);return r
  }
  try{
    if(device.state!=='Booted'){command(['simctl','boot',deviceId]);booted=true;command(['simctl','bootstatus',deviceId,'-b'])}
    let preexisting=false
    try{const existing=command(['simctl','get_app_container',deviceId,readinessAppId,'app']).trim();await fs.stat(existing);preexisting=true}catch{/* absent or stale simulator registration */}
    assert.equal(preexisting,false,'Refuse to replace a pre-existing fixture')
    fixture=buildReadinessFixture('ios');command(['simctl','install',deviceId,fixture.artifact]);installed=true
    command(['simctl','launch',deviceId,readinessAppId])
    await client.connect(transport)
    const cap=await call('get_system_trace_capabilities',traceTarget)
    assert.equal(cap.supported,true,JSON.stringify(cap));assert.equal(cap.prerequisites.permissions,'unknown')
    const tree=await call('get_ui_tree',target)
    assert.ok(tree.elements.some((e:any)=>e.text==='Ready'),'Fixture must be semantically visible')
    assert.ok(tree.elements.some((e:any)=>e.text==='Show loader'),'Fixture button must be semantically visible')
    const recording=await start()
    const baselineJourney=await call('run_journey',{...target,systemTraceId:recording.trace_id,steps:[{id:'ready',type:'assert',timeoutMs:10000,assertion:{kind:'element_visible',selector:{text:'Ready'}}}]})
    assert.equal(baselineJourney.success,true,JSON.stringify(baselineJourney));checks.linked_baseline='PASS; Ready asserted via built-server journey'
    const journeySubmitted=Date.now()
    const journey=await call('run_journey',{...target,systemTraceId:recording.trace_id,steps:[
      {id:'show-loader',type:'tap',selector:{text:'Show loader'},verificationMode:'none'},
      {id:'done',type:'assert',timeoutMs:30000,assertion:{kind:'element_visible',selector:{text:'Done'}}}
    ]})
    if (!journey.success) journeyFailure = new Error(`Traced fixture input journey failed at ${journey.stopped_at_step_id}; ${journey.steps[0].result?.failure_code}`)
    else assert.equal(journey.steps[1].status,'passed')
    assert.equal(journey.evidence.trace_id,recording.trace_id)
    assert.equal(journey.steps[0].result.evidence.trace_id,recording.trace_id)
    assert.equal(journey.system_trace.coverage,'covered');assert.ok(recording.recording_ready_at_ms<=journeySubmitted)
    const completed=await stop(recording.trace_id)
    assert.equal(completed.device.id,deviceId);assert.equal(completed.app_id,readinessAppId)
    assert.deepEqual(completed.correlation_ids,[baselineJourney.evidence.correlation_id,journey.evidence.correlation_id]);assert.ok(completed.artifact.validation.sample_rows>0)
    checks.journey={status:journey.success?'PASS':'FAIL',trace_id:recording.trace_id,correlation_id:journey.evidence.correlation_id,
      ready_at_ms:recording.recording_ready_at_ms,journey_submitted_at_ms:journeySubmitted,outcome:journey.success?'Done visible via journey UI-tree assertion':journeyFailure?.message,
      sample_rows:completed.artifact.validation.sample_rows,artifact_bytes:completed.artifact.size_bytes,warnings:completed.warnings}
    const stale=await call('run_journey',{...target,systemTraceId:recording.trace_id,steps:[{id:'must-not-tap',type:'tap',selector:{text:'Show loader'},verificationMode:'none'}]})
    assert.equal(stale.error.code,'TRACE_NOT_FOUND')
    const unchanged=await call('expect_element_visible',{...target,selector:{text:journey.success?'Done':'Ready'},timeoutMs:10000})
    assert.ok(unchanged.success||unchanged.visible||unchanged.status==='success',JSON.stringify(unchanged))
    checks.stale_id='PASS; rejected tap left prior fixture label visible'
    const cancelled=await start(30000),directory=cancelled.cleanup.remaining_resources[0]
    const cancel=await call('cancel_system_trace',{traceId:cancelled.trace_id})
    assert.equal(cancel.state,'cancelled');assert.equal(cancel.cleanup.status,'complete');assert.equal(cancel.artifact,null);owned.delete(cancelled.trace_id)
    await assert.rejects(()=>fs.stat(directory),{code:'ENOENT'});checks.cancel='PASS'
    const short=await start(5000)
    let expired=short
    for(let i=0;i<90&&expired.state==='recording';i++){
      await new Promise(r=>setTimeout(r,500));expired=await call('get_system_trace_status',{traceId:short.trace_id})
    }
    if(expired.artifact)artifacts.push(expired.artifact.path)
    assert.equal(expired.state,'completed',JSON.stringify(expired));assert.equal(expired.completion_reason,'duration_limit');assert.equal(expired.cleanup.status,'complete');owned.delete(short.trace_id);checks.expiry='PASS'
    const failedRecording=await start(60000)
    const failedJourney=await call('run_journey',{...target,systemTraceId:failedRecording.trace_id,steps:[{id:'missing',type:'assert',timeoutMs:1000,assertion:{kind:'element_visible',selector:{text:'impossible-trace-fixture-label'}}}]})
    assert.equal(failedJourney.success,false)
    assert.equal((await call('get_system_trace_status',{traceId:failedRecording.trace_id})).state,'recording')
    await stop(failedRecording.trace_id);checks.failed_journey='PASS; failure retained capture for explicit stop'
    await verifyIosTraceShutdown(traceTarget,inputEnvironment());checks.shutdown='PASS; owned recording and partial directory removed'
    const live=command(['simctl','spawn',deviceId,'launchctl','list'])
    assert.ok(live.includes(`UIKitApplication:${readinessAppId}[`),'Recorder cleanup must leave the fixture app running')
    checks.app_survived_cleanup='PASS'
    const hash=createHash('sha256')
    for(const file of ['dist/server.js','dist/observe/system-trace.js','dist/observe/system-trace-router.js','dist/observe/ios-trace/native.js','dist/observe/ios-trace/sessions.js','dist/observe/ios-trace/process.js'])hash.update(await fs.readFile(file))
    checks.status=journeyFailure?'FAIL':'PASS';checks.build_sha256=hash.digest('hex');checks.runtime=process.version;checks.device=deviceId;checks.server=client.getServerVersion()
    checks.physical_device='UNRUN; unsupported initial matrix';checks.native_failure_injection='UNRUN on real target; deterministic unit tests separate'
    checks.input_toolchain=process.env.IDB_COMPANION?'Explicit test companion via IDB_COMPANION; see investigation.md':'Repository default idb companion'
    if(journeyFailure) throw journeyFailure
  }catch(error){checks.status='FAIL';checks.error=String(error);throw error}finally{
    const errors:string[]=[]
    for(const id of owned)try{const r=await call('cancel_system_trace',{traceId:id});if(r.artifact&&!artifacts.includes(r.artifact.path))artifacts.push(r.artifact.path);if(r.cleanup?.status!=='complete')errors.push(id)}catch{errors.push(id)}
    await client.close()
    for(const file of artifacts)await fs.rm(path.dirname(file),{recursive:true,force:true})
    if(installed)command(['simctl','uninstall',deviceId,readinessAppId])
    if(fixture)await fs.rm(fixture.directory,{recursive:true,force:true})
    if(booted)command(['simctl','shutdown',deviceId])
    checks.cleanup={trace_errors:errors,fixture_removed:installed,simulator_shutdown:booted,host_artifacts_removed:true}
    console.log(JSON.stringify(checks))
    if(process.env.IOS_SYSTEM_TRACE_EVIDENCE_PATH)await fs.writeFile(process.env.IOS_SYSTEM_TRACE_EVIDENCE_PATH,JSON.stringify(checks,null,2)+'\n')
    assert.deepEqual(errors,[],'Trace cleanup failed')
  }
}
run().catch(error=>{console.error(error);process.exitCode=1})
