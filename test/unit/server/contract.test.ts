import assert from 'assert'
import { handleToolCall, serverInfo, toolDefinitions } from '../../../src/server-core.js'

async function run() {
  const names = toolDefinitions.map((tool) => tool.name)
  const uniqueNames = new Set(names)

  assert.strictEqual(serverInfo.name, 'mobile-debug-mcp')
  assert.strictEqual(names.length, uniqueNames.size, 'tool names should be unique')
  assert(names.includes('wait_for_ui'))
  assert(names.includes('expect_screen'))
  assert(names.includes('expect_element_visible'))
  assert(names.includes('capture_screenshot'))
  assert(names.includes('get_ui_tree'))
  assert(names.includes('tap_element'))

  const waitForUI = toolDefinitions.find((tool) => tool.name === 'wait_for_ui')
  assert(waitForUI, 'wait_for_ui should be registered')
  assert.strictEqual((waitForUI as any).inputSchema.properties.timeout_ms.default, 60000)
  assert.strictEqual((waitForUI as any).inputSchema.properties.condition.default, 'exists')
  assert.match((waitForUI as any).description, /resolve elements/i)
  assert.match((waitForUI as any).description, /must not be used alone to confirm action success/i)
  assert.match((waitForUI as any).description, /follow with expect_\*/i)

  const waitForScreenChange = toolDefinitions.find((tool) => tool.name === 'wait_for_screen_change')
  assert(waitForScreenChange, 'wait_for_screen_change should be registered')
  assert.match((waitForScreenChange as any).description, /does not verify correctness of the resulting state/i)
  assert.match((waitForScreenChange as any).description, /follow with expect_screen/i)
  assert.match((waitForScreenChange as any).description, /backend\/API activity without a visible UI change/i)

  const captureDebugSnapshot = toolDefinitions.find((tool) => tool.name === 'capture_debug_snapshot')
  assert(captureDebugSnapshot, 'capture_debug_snapshot should be registered')
  assert.strictEqual((captureDebugSnapshot as any).inputSchema.properties.includeLogs.default, true)
  assert.strictEqual((captureDebugSnapshot as any).inputSchema.properties.logLines.default, 200)
  assert.match((captureDebugSnapshot as any).description, /raw observation layer/i)
  assert.match((captureDebugSnapshot as any).description, /optional derived semantic layer/i)

  const startLogStream = toolDefinitions.find((tool) => tool.name === 'start_log_stream')
  assert(startLogStream, 'start_log_stream should be registered')
  assert.strictEqual((startLogStream as any).inputSchema.properties.platform.default, 'android')

  const startApp = toolDefinitions.find((tool) => tool.name === 'start_app')
  assert(startApp, 'start_app should be registered')
  assert.deepStrictEqual((startApp as any).inputSchema.required, ['platform', 'appId'])

  const tapElement = toolDefinitions.find((tool) => tool.name === 'tap_element')
  assert(tapElement, 'tap_element should be registered')
  assert.deepStrictEqual((tapElement as any).inputSchema.required, ['elementId'])
  assert.match((tapElement as any).description, /RESOLVE → ACT → WAIT \(if needed\) → EXPECT/)
  assert.match((tapElement as any).description, /If needed, wait for transition using wait_for_\*/)
  assert.match((tapElement as any).description, /Verify outcome using expect_\*/)

  const expectScreen = toolDefinitions.find((tool) => tool.name === 'expect_screen')
  assert(expectScreen, 'expect_screen should be registered')
  assert.match((expectScreen as any).description, /Primary and authoritative verification tool/i)
  assert.match((expectScreen as any).description, /final verification step/i)
  assert.match((expectScreen as any).description, /Returns structured binary success\/failure only/i)

  const expectElementVisible = toolDefinitions.find((tool) => tool.name === 'expect_element_visible')
  assert(expectElementVisible, 'expect_element_visible should be registered')
  assert.deepStrictEqual((expectElementVisible as any).inputSchema.required, ['selector'])
  assert.match((expectElementVisible as any).description, /Primary and authoritative verification tool/i)
  assert.match((expectElementVisible as any).description, /selector is the primary input/i)
  assert.match((expectElementVisible as any).description, /Returns structured binary success\/failure only/i)

  const classifyActionOutcome = toolDefinitions.find((tool) => tool.name === 'classify_action_outcome')
  assert(classifyActionOutcome, 'classify_action_outcome should be registered')
  assert.match((classifyActionOutcome as any).description, /backend\/API activity without a visible UI change/i)
  assert.match((classifyActionOutcome as any).description, /get_network_activity/i)
  assert.match((classifyActionOutcome as any).description, /immediately after the action/i)

  const getNetworkActivity = toolDefinitions.find((tool) => tool.name === 'get_network_activity')
  assert(getNetworkActivity, 'get_network_activity should be registered')
  assert.match((getNetworkActivity as any).description, /backend\/API activity without a visible UI change/i)
  assert.doesNotMatch((getNetworkActivity as any).description, /Call this only when/i)
  assert.match((getNetworkActivity as any).description, /immediately after an action/i)

  await assert.rejects(() => handleToolCall('unknown_tool'), /Unknown tool: unknown_tool/)

  console.log('server contract tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
