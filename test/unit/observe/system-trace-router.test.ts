import assert from 'node:assert/strict'
import { SystemTraceRouter } from '../../../src/observe/system-trace-router.js'
import type { SystemTraceSessions, TraceResult } from '../../../src/observe/system-trace.js'
import type { IosTraceSessions, IosTraceResult } from '../../../src/observe/ios-trace/sessions.js'
import type { IosTraceNative } from '../../../src/observe/ios-trace/native.js'
function backend(platform:'android'|'ios') {
  let next=0,starts=0
  const results=new Map<string,TraceResult|IosTraceResult>()
  const api={
    capabilities:async()=>({}),
    start:async(device:string|{id:string})=>{
      starts++
      const result={trace_id:platform+ ++next,device:{platform,id:typeof device==='string'?device:device.id},state:'recording',cleanup:{status:'pending'}} as TraceResult|IosTraceResult
      results.set(result.trace_id,result);return result
    },
    control:async(id:string,op:string)=>{
      const result=results.get(id);if(!result)throw new Error('TRACE_NOT_FOUND')
      if(op==='cancel'){result.cleanup.status='complete';result.state='cancelled'}
      return result
    },
    link:async()=>async()=>({trace_id:'linked',coverage:'covered',clock_alignment:'unknown'}),
    shutdown:async()=>[]
  }
  return {api,results,count:()=>starts}
}
async function run(){
  const android=backend('android'),ios=backend('ios')
  let release!:()=>void,gate=Promise.resolve()
  const native={shutdown:()=>{},capabilities:async(device:string)=>{await gate;return {supported:true,device:{platform:'ios',id:device,simulator:true}}}} as unknown as IosTraceNative
  const router=new SystemTraceRouter(android.api as unknown as SystemTraceSessions,ios.api as unknown as IosTraceSessions,native)
  const a=await router.start('a'),b=await router.start('b',30000,{appId:'fixture'})
  await assert.rejects(()=>router.link(b.trace_id,{platform:'android',id:'b'},'bad'),/TRACE_NOT_FOUND/)
  await assert.rejects(()=>router.link(b.trace_id,{platform:'ios',id:'other'},'bad'),/TRACE_NOT_FOUND/)
  await assert.rejects(()=>router.start('b',30000,{appId:'fixture'}),/TRACE_BUSY/)
  await router.start('c');await router.start('d',30000,{appId:'fixture'})
  await assert.rejects(()=>router.start('fifth'),/TRACE_BUSY/)
  await router.control(a.trace_id,'cancel')
  await router.start('freed')
  await router.control(b.trace_id,'cancel')
  gate=new Promise<void>(r=>{release=r})
  const first=router.start('pending',30000,{appId:'fixture'})
  await new Promise(r=>setImmediate(r))
  await assert.rejects(()=>router.start('pending',30000,{appId:'fixture'}),/TRACE_BUSY/)
  release();await first
  assert.equal(ios.count(),3)
  await router.shutdown();await assert.rejects(()=>router.start('closed'),/TRACE_BUSY/)
  console.log('PASS cross-platform trace routing, pinned linkage, shared reservations and shutdown')
}
run().catch(error=>{console.error(error);process.exitCode=1})
