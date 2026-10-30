#!/usr/bin/env node
import { systemTraces } from './observe/system-trace.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server-core.js'
import { getSystemStatus } from './system/index.js'

const server = createServer()

if (process.env.MOBILE_DEBUG_MCP_STARTUP_HEALTHCHECK === '1') {
  getSystemStatus().then((res) => {
    console.info('[startup] system status summary:', { adb: res.adbAvailable, ios: res.iosAvailable, devices: res.devices, iosDevices: res.iosDevices })
  }).catch((e) => console.warn('[startup] healthcheck failed:', e instanceof Error ? e.message : String(e)))
}

const transport = new StdioServerTransport()

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  const deadline = setTimeout(() => { console.error('System trace shutdown cleanup timed out; owned device captures remain duration-bounded.'); process.exit(1) }, 10000)
  let exitCode = 0
  try {
    const remaining = await systemTraces.shutdown()
    if (remaining.length) {
      exitCode = 1
      console.error('System trace shutdown cleanup incomplete:', remaining.map(s => ({ trace_id: s.trace_id, device: s.device, cleanup: s.cleanup })))
    }
    await server.close()
  } catch { exitCode = 1; console.error('Server shutdown cleanup failed.') }
  finally { clearTimeout(deadline); process.exit(exitCode) }
}
server.onclose = () => { void shutdown() }
process.stdin.on('end', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })

async function main() {
  await (server as any).connect(transport)
}

main().catch((error) => {
  console.error('Server failed to start:', error)
})
