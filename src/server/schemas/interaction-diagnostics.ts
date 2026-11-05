import { z } from 'zod'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
export const diagnosticsSchema = z.object({ sessionId: z.string().uuid(), resultId: z.string().uuid() }).strict()
export const interactionDiagnosticsTool: Tool = {
  name: 'get_interaction_diagnostics',
  description: 'Read the retained original interaction or journey result without replaying input or observing the device. Pass diagnostics.session_id/result_id as sessionId/resultId. Session-local memory: ten minutes, 100 results, 16 MiB total, 1 MiB per result. Expired, evicted or restarted results are unavailable. May contain private UI text and errors; compact output is not redaction.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'resultId'], properties: {
    sessionId: { type: 'string', format: 'uuid' }, resultId: { type: 'string', format: 'uuid' }
  } }
}
