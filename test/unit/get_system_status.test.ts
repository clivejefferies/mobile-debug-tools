import assert from 'assert'
import { ensureAdbAvailable } from '../../src/utils/android/utils.js'
import { getXcrunCmd } from '../../src/utils/ios/utils.js'

// We import the server handler module to access the internal get_system_status implementation.
import * as server from '../../src/server.js'

// Small helper to call the tool handler similarly to how the MCP transport would.
async function callGetSystemStatus() {
  const req = { params: { name: 'get_system_status', arguments: {} } }
  // @ts-ignore - use the handler exported from server
  const handler = (server as any).defaultRequestHandler || (server as any).callToolHandler || (server as any).__callTool
  if (!handler) {
    // fallback: require the module and call the exported server instance's request handler
    // The server code registers the handler directly; we will emulate by requiring compiled code in dist if available.
    try {
      const dist = await import('../../dist/server.js')
      // Try to execute by sending a call via the server instance if exported
      if (dist && dist.server && typeof dist.server._handleCall === 'function') {
        return dist.server._handleCall(req)
      }
    } catch {
      // best effort only
    }
    throw new Error('Cannot locate server call handler for tests')
  }

  return handler(req)
}

describe('get_system_status tool (unit)', () => {
  it('returns structured result without throwing', async () => {
    const res = await callGetSystemStatus()
    // Handler returns { content: [{ type: 'text', text: JSON.stringify(...) }] }
    assert(res && res.content && Array.isArray(res.content))
    const textBlock = res.content.find((c: any) => c.type === 'text')
    assert(textBlock && textBlock.text)
    const payload = JSON.parse(textBlock.text)
    assert(typeof payload.success === 'boolean')
    assert(Array.isArray(payload.issues))
  }).timeout(5000)

  it('detects adb availability helper works', () => {
    const adb = ensureAdbAvailable()
    assert(adb && typeof adb.ok === 'boolean')
  })

  it('detects xcrun command helper exists', () => {
    const cmd = getXcrunCmd()
    assert(typeof cmd === 'string')
  })
})
