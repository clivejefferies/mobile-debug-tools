import { TraceError } from '../../observe/system-trace.js'
import { withEvidence, validateActionRef } from '../../observe/evidence.js'
import { wrapResponse, wrapToolError, type ToolHandler } from '../common.js'
export function correlatedHandler(name: string, handler: ToolHandler, action = false, journey = false): ToolHandler {
  return async args => {
    const ref = validateActionRef(args.actionRef)
    const { result, evidence } = await withEvidence({ action, journey, ref }, async () => {
      try { return await handler(args) }
      catch (error) { return error instanceof TraceError ? { ...wrapResponse({ error: { tool: name, code: error.code, message: error.message } }), isError: true } : wrapToolError(name, error) }
    })
    const item = result.content.find(item => item.type === 'text')
    if (item?.text) {
      const payload = JSON.parse(item.text)
      payload.evidence = evidence
      item.text = JSON.stringify(payload)
    }
    return result
  }
}

