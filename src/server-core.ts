import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js'

import { wrapResponse } from './server/common.js'
import { toolDefinitions } from './server/tool-definitions.js'
import { HttpTraceSessions } from './observe/http-trace/sessions.js'
import { configuredTraceTransport } from './observe/http-trace/resources.js'
import { handleHttpTrace, httpTraceNames } from './server/handlers/http-trace.js'
import { handleToolCall } from './server/handlers/tool-handlers.js'
import { withBenchmarkRequest, benchmarkStage } from './utils/benchmark-metrics.js'

export { wrapResponse, toolDefinitions, handleToolCall }

export const serverInfo = {
  name: 'mobile-debug-mcp',
  version: '0.37.0'
}

export function createServer(httpTraces = new HttpTraceSessions()) {
  const server = new Server(
    serverInfo,
    {
      capabilities: {
        resources: {},
        tools: {}
      }
    }
  )

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: []
  }))

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: []
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async () => ({
    contents: []
  }))

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: configuredTraceTransport() ? toolDefinitions : toolDefinitions.filter(tool => !httpTraceNames.has(tool.name))
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request: SchemaOutput<typeof CallToolRequestSchema>, extra) => {
    const { name, arguments: args } = request.params
    if (httpTraceNames.has(name)) return handleHttpTrace(httpTraces, name, args ?? {}, extra.signal)
    const operation = () => handleToolCall(name, args as Record<string, unknown>, extra.signal)
    return withBenchmarkRequest(name, () => name.startsWith('expect_') || name.startsWith('wait_for_')
      ? benchmarkStage(name.startsWith('expect_') ? 'assertion_ms' : 'wait_ms', operation) : operation())
  })

  server.onclose = () => { void httpTraces.shutdown() }
  return server
}
