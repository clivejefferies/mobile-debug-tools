import assert from 'node:assert/strict'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { toolDefinitions } from '../../../src/server/tool-definitions.js'
import { conditionalTools, validateExpectedState } from '../../../src/server/condition-schema.js'
import { journeySchema } from '../../../src/server/journey-schema.js'

const provider = new AjvJsonSchemaValidator()
const expectedState = { snapshotSessionId: 'session-fixture', snapshotRevision: 1 }
for (const name of conditionalTools) {
  const schema = toolDefinitions.find(tool => tool.name === name)!.inputSchema
  const validate = provider.getValidator(schema)
  const args = { platform: 'android', deviceId: 'emulator-5554', expectedState,
    ...({ tap: { x: 1, y: 1 }, tap_element: { selector: { text: 'Go' } }, swipe: { x1: 1, y1: 1, x2: 2, y2: 2, duration: 100 }, type_text: { text: 'hello' }, press_back: {} }[name]) }
  assert.equal(validate(args).valid, true, `${name} schema accepts valid guarded input`)
  assert.deepEqual(validateExpectedState(name, args), expectedState)
  for (const extra of [
    { expectedState: null }, { expectedState: {} }, { expectedState: { ...expectedState, extra: true } },
    { expectedState: { ...expectedState, snapshotRevision: 0 } }, { expectedState: { ...expectedState, snapshotRevision: 1.5 } },
    { expectedState: { ...expectedState, snapshotRevision: Number.MAX_SAFE_INTEGER + 1 } },
    { expectedState: { ...expectedState, snapshotSessionId: '' } }, { expectedState: { ...expectedState, timeoutMs: 99 } },
    { expectedState: { ...expectedState, timeoutMs: 60001 } }, { expectedState: { ...expectedState, timeoutMs: '15000' } },
    { platform: null }, { deviceId: 'booted' }, { deviceId: 'default' }, { deviceId: '' }, { deviceId: ' ' }
  ]) {
    const input = { ...args, ...extra }
    assert.equal(validate(input).valid, false, JSON.stringify(input))
    assert.throws(() => validateExpectedState(name, input), /INVALID_ARGUMENT/)
  }
  const withoutDevice: any = { ...args }; delete withoutDevice.deviceId
  assert.equal(validate(withoutDevice).valid, false)
  assert.throws(() => validateExpectedState(name, withoutDevice), /INVALID_ARGUMENT/)
  const ios = { ...args, platform: 'ios', deviceId: 'concrete-udid' }
  const supported = !['type_text', 'press_back'].includes(name)
  assert.equal(validate(ios).valid, supported)
  if (supported) assert.deepEqual(validateExpectedState(name, ios), expectedState)
  else assert.throws(() => validateExpectedState(name, ios), /INVALID_ARGUMENT/)
}
for (const name of ['start_app', 'restart_app', 'terminate_app', 'reset_app_data', 'scroll_to_element', 'adjust_control', 'get_ui_tree']) {
  const schema = toolDefinitions.find(tool => tool.name === name)!.inputSchema
  const args = { platform: 'android', deviceId: 'emulator-5554', appId: 'example.app', selector: { text: 'Go' }, targetValue: 1, expectedState }
  assert.equal(provider.getValidator(schema)(args).valid, false)
  assert.throws(() => validateExpectedState(name, args), /INVALID_ARGUMENT/)
}
const validateJourney = provider.getValidator(toolDefinitions.find(tool => tool.name === 'run_journey')!.inputSchema)
const step = { id: 'tap', type: 'tap', selector: { text: 'Go' }, expectedState }
const journey = { platform: 'android', steps: [step] }
assert.equal(validateJourney(journey).valid, true)
assert.equal(journeySchema.safeParse(journey).success, true)
for (const input of [
  { ...journey, expectedState },
  { ...journey, defaults: { expectedState } },
  { ...journey, steps: [{ id: 'wait', type: 'wait', selector: { text: 'Go' }, expectedState }] },
  { ...journey, steps: [{ id: 'launch', type: 'start_app', appId: 'example.app', expectedState }] },
  { ...journey, steps: [{ id: 'assert', type: 'assert', assertion: { kind: 'element_visible', selector: { text: 'Go' } }, expectedState }] },
  { ...journey, steps: [{ ...step, expectedState: { ...expectedState, timeoutMs: 0 } }] }
]) {
  assert.equal(validateJourney(input).valid, false)
  assert.equal(journeySchema.safeParse(input).success, false)
}
console.log('Conditional JSON schema/runtime parity: PASS')
