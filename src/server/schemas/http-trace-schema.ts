import { z } from 'zod'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const emulator = '^emulator-[0-9]+$'
const hostname = '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$'
const app = '^[a-zA-Z][a-zA-Z0-9_]*(?:\\.[a-zA-Z][a-zA-Z0-9_]*)+$'
export const httpTraceStart = z.object({
  deviceId: z.string().max(32).regex(new RegExp(emulator)),
  allowedHosts: z.array(z.string().max(253).regex(new RegExp(hostname)).refine(value => !/^[0-9.]+$/.test(value))).min(1).max(32),
  appId: z.string().max(255).regex(new RegExp(app)).optional(),
}).strict()
const traceId = z.string().uuid()
export const httpTraceRead = z.object({
  traceId,
  cursor: z.string().max(128).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  pageSize: z.number().int().min(1).max(100).default(50),
}).strict()
export const httpTraceStop = z.object({ traceId }).strict()

const id = { type: 'string', format: 'uuid' }
const object = { type: 'object' as const, additionalProperties: false }
export const httpTraceTools: Tool[] = [
  { name: 'start_http_trace', description: 'Start an owned HTTPS metadata trace on a selected Android emulator. Requires a configured private trace backend. Optional appId configures an opted-in debug app.',
    inputSchema: { ...object, required: ['deviceId', 'allowedHosts'], properties: {
      deviceId: { type: 'string', pattern: emulator, maxLength: 32 },
      allowedHosts: { type: 'array', minItems: 1, maxItems: 32, items: {
        type: 'string', maxLength: 253, pattern: hostname, not: { pattern: '^[0-9.]+$' },
      } },
      appId: { type: 'string', pattern: app, maxLength: 255 },
    } } },
  { name: 'read_http_trace', description: 'Read bounded, redacted HTTPS metadata from an active trace owned by this MCP session.',
    inputSchema: { ...object, required: ['traceId'], properties: {
      traceId: id, cursor: { type: 'string', maxLength: 128, pattern: '^[a-zA-Z0-9_-]+$' },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    } } },
  { name: 'stop_http_trace', description: 'Stop an owned HTTPS trace and remove its relay, listener and app configuration.',
    inputSchema: { ...object, required: ['traceId'], properties: { traceId: id } } },
]
