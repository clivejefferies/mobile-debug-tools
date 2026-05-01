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
import { handleToolCall } from './server/tool-handlers.js'

export { wrapResponse, toolDefinitions, handleToolCall }

export const serverInfo = {
  name: 'mobile-debug-mcp',
  version: '0.29.0'
}

export function createServer() {
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
    tools: toolDefinitions
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request: SchemaOutput<typeof CallToolRequestSchema>) => {
    const { name, arguments: args } = request.params
    return handleToolCall(name, args as Record<string, unknown>)
  })

  return server
}
