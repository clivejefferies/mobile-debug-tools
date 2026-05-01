#!/usr/bin/env node
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

async function main() {
  await (server as any).connect(transport)
}

main().catch((error) => {
  console.error('Server failed to start:', error)
})
