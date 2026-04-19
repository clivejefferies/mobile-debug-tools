import assert from 'assert'
import { handleToolCall, serverInfo, toolDefinitions } from '../../../src/server-core.js'

async function run() {
  const names = toolDefinitions.map((tool) => tool.name)
  const uniqueNames = new Set(names)

  assert.strictEqual(serverInfo.name, 'mobile-debug-mcp')
  assert.strictEqual(names.length, uniqueNames.size, 'tool names should be unique')
  assert(names.includes('wait_for_ui'))
  assert(names.includes('capture_screenshot'))
  assert(names.includes('get_ui_tree'))
  assert(names.includes('tap_element'))

  const waitForUI = toolDefinitions.find((tool) => tool.name === 'wait_for_ui')
  assert(waitForUI, 'wait_for_ui should be registered')
  assert.strictEqual((waitForUI as any).inputSchema.properties.timeout_ms.default, 60000)
  assert.strictEqual((waitForUI as any).inputSchema.properties.condition.default, 'exists')

  const captureDebugSnapshot = toolDefinitions.find((tool) => tool.name === 'capture_debug_snapshot')
  assert(captureDebugSnapshot, 'capture_debug_snapshot should be registered')
  assert.strictEqual((captureDebugSnapshot as any).inputSchema.properties.includeLogs.default, true)
  assert.strictEqual((captureDebugSnapshot as any).inputSchema.properties.logLines.default, 200)

  const startLogStream = toolDefinitions.find((tool) => tool.name === 'start_log_stream')
  assert(startLogStream, 'start_log_stream should be registered')
  assert.strictEqual((startLogStream as any).inputSchema.properties.platform.default, 'android')

  const startApp = toolDefinitions.find((tool) => tool.name === 'start_app')
  assert(startApp, 'start_app should be registered')
  assert.deepStrictEqual((startApp as any).inputSchema.required, ['platform', 'appId'])

  const tapElement = toolDefinitions.find((tool) => tool.name === 'tap_element')
  assert(tapElement, 'tap_element should be registered')
  assert.deepStrictEqual((tapElement as any).inputSchema.required, ['elementId'])

  await assert.rejects(() => handleToolCall('unknown_tool'), /Unknown tool: unknown_tool/)

  console.log('server contract tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
