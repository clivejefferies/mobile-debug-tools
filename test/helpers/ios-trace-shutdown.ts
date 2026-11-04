import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export async function verifyIosTraceShutdown(target: Record<string,unknown>, env: Record<string,string> = {}) {
  const client=new Client({name:'ios-trace-shutdown',version:'1.0.0'})
  const transport=new StdioClientTransport({command:process.execPath,args:['dist/server.js'],stderr:'pipe',env})
  let diagnostics=''
  transport.stderr?.on('data',chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-4096)})
  try {
    await client.connect(transport)
    const capability=await client.callTool({name:'get_system_trace_capabilities',arguments:target},undefined,{timeout:120000})
    const capabilities=JSON.parse((capability.content as any[]).find(c=>c.type==='text').text)
    assert.equal(capabilities.supported,true,JSON.stringify(capabilities))
    const response=await client.callTool({name:'start_system_trace',arguments:{...target,durationMs:30000}},undefined,{timeout:120000})
    const result=JSON.parse((response.content as any[]).find(c=>c.type==='text').text)
    assert.equal(result.state,'recording',JSON.stringify(result))
    const directory=result.cleanup.remaining_resources[0]
    assert.ok(transport.pid)
    process.kill(transport.pid,'SIGTERM')
    let removed=false
    for(let i=0;i<24;i++){
      try {await fs.stat(directory)} catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT'){removed=true;break}throw error}
      await new Promise(resolve=>setTimeout(resolve,500))
    }
    assert.equal(removed,true,`Server shutdown must remove its owned partial trace directory; ${diagnostics}`)
  } finally {await client.close()}
}
