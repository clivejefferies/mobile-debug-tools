import assert from 'assert'
import { traverseNode } from '../../../src/utils/android/utils.js'
import { traverseIDBNode } from '../../../src/observe/ios.js'

async function run() {
  const androidElements: any[] = []
  traverseNode({
    '@_class': 'android.widget.SeekBar',
    '@_text': '',
    '@_content-desc': 'Duration',
    '@_resource-id': 'com.example:id/duration',
    '@_clickable': 'true',
    '@_enabled': 'true',
    '@_selected': 'true',
    '@_progress': '7',
    '@_max': '14',
    '@_bounds': '[0,0][200,40]'
  }, androidElements)

  assert.strictEqual(androidElements.length, 1)
  assert.deepStrictEqual(androidElements[0].state?.selected, 'Duration')
  assert.strictEqual(androidElements[0].state?.raw_value, 7)
  assert.strictEqual(androidElements[0].state?.value, 50)
  assert.deepStrictEqual(androidElements[0].state?.value_range, { min: 0, max: 14 })
  assert.strictEqual(androidElements[0].stable_id, 'com.example:id/duration')
  assert.strictEqual(androidElements[0].role, 'slider')
  assert.strictEqual(androidElements[0].test_tag, 'com.example:id/duration')
  assert.deepStrictEqual(androidElements[0].selector, {
    value: 'com.example:id/duration',
    confidence: { score: 1, reason: 'resource_id' }
  })
  assert.deepStrictEqual(androidElements[0].semantic, {
    is_clickable: true,
    is_container: false,
    semantic_role: 'slider',
    supported_actions: ['adjust'],
    adjustable: true,
    state_shape: 'continuous'
  })

  const androidProgressElements: any[] = []
  traverseNode({
    '@_class': 'android.widget.ProgressBar',
    '@_text': 'Loading progress',
    '@_content-desc': 'Loading progress',
    '@_enabled': 'true',
    '@_progress': '40',
    '@_max': '100',
    '@_bounds': '[0,0][200,40]'
  }, androidProgressElements)

  assert.notStrictEqual(androidProgressElements[0]?.role, 'slider')
  assert.notStrictEqual(androidProgressElements[0]?.state?.value, 40)
  assert.notStrictEqual(androidProgressElements[0]?.semantic?.adjustable, true)

  const androidStepperElements: any[] = []
  traverseNode({
    '@_class': 'android.widget.NumberPicker',
    '@_text': 'Quantity',
    '@_content-desc': 'Quantity stepper',
    '@_clickable': 'false',
    '@_enabled': 'true',
    '@_bounds': '[0,0][200,80]'
  }, androidStepperElements)
  assert.strictEqual(androidStepperElements[0].role, 'stepper')
  assert.deepStrictEqual(androidStepperElements[0].semantic?.semantic_role, 'stepper')
  assert.deepStrictEqual(androidStepperElements[0].semantic?.supported_actions, ['increment', 'decrement'])
  assert.strictEqual(androidStepperElements[0].semantic?.adjustable, true)

  const androidFallbackElements: any[] = []
  traverseNode({
    '@_class': 'android.widget.Button',
    '@_text': '',
    '@_content-desc': 'Save',
    '@_clickable': 'true',
    '@_enabled': 'true',
    '@_bounds': '[0,0][100,50]'
  }, androidFallbackElements)

  assert.strictEqual(androidFallbackElements.length, 1)
  assert.strictEqual(androidFallbackElements[0].resourceId, null)
  assert.strictEqual(androidFallbackElements[0].stable_id, 'Save')
  assert.deepStrictEqual(androidFallbackElements[0].selector, {
    value: 'Save',
    confidence: { score: 0.9, reason: 'content_description' }
  })

  const iosElements: any[] = []
  traverseIDBNode({
    AXElementType: 'Slider',
    AXLabel: 'Playback speed',
    AXValue: '0.75',
    AXUniqueId: 'playback_speed_slider',
    AXTraits: ['UIAccessibilityTraitAdjustable']
  }, iosElements)

  assert.strictEqual(iosElements.length, 1)
  assert.strictEqual(iosElements[0].state?.value, 75)
  assert.strictEqual(iosElements[0].state?.raw_value, 0.75)
  assert.strictEqual(iosElements[0].stable_id, 'playback_speed_slider')
  assert.strictEqual(iosElements[0].role, 'slider')
  assert.strictEqual(iosElements[0].test_tag, 'playback_speed_slider')
  assert.deepStrictEqual(iosElements[0].selector, {
    value: 'playback_speed_slider',
    confidence: { score: 1, reason: 'accessibility_identifier' }
  })
  assert.deepStrictEqual(iosElements[0].semantic, {
    is_clickable: true,
    is_container: false,
    semantic_role: 'slider',
    supported_actions: ['adjust'],
    adjustable: true,
    state_shape: 'continuous'
  })

  const iosProgressElements: any[] = []
  traverseIDBNode({
    AXElementType: 'ProgressIndicator',
    AXLabel: 'Loading progress',
    AXValue: '0.4',
    AXTraits: ['UIAccessibilityTraitUpdatesFrequently']
  }, iosProgressElements)

  assert.notStrictEqual(iosProgressElements[0]?.role, 'slider')

  const iosStepperElements: any[] = []
  traverseIDBNode({
    AXElementType: 'Stepper',
    AXLabel: 'Quantity',
    AXValue: '1',
    AXTraits: ['UIAccessibilityTraitAdjustable']
  }, iosStepperElements)
  assert.strictEqual(iosStepperElements[0].role, 'stepper')
  assert.strictEqual(iosStepperElements[0].semantic?.semantic_role, 'stepper')
  assert.deepStrictEqual(iosStepperElements[0].semantic?.supported_actions, ['increment', 'decrement'])
  assert.strictEqual(iosStepperElements[0].semantic?.state_shape, 'discrete')

  const iosSegmentedElements: any[] = []
  traverseIDBNode({
    AXElementType: 'Segmented Control',
    AXLabel: 'Playback mode',
    AXTraits: ['UIAccessibilityTraitButton']
  }, iosSegmentedElements)
  assert.strictEqual(iosSegmentedElements[0].role, 'segmented_control')
  assert.strictEqual(iosSegmentedElements[0].semantic?.semantic_role, 'segmented_control')
  assert.deepStrictEqual(iosSegmentedElements[0].semantic?.supported_actions, ['tap'])

  const iosCustomAdjustableElements: any[] = []
  traverseIDBNode({
    AXElementType: 'CustomControl',
    AXLabel: 'Intensity',
    AXValue: '0.25',
    AXTraits: ['UIAccessibilityTraitAdjustable']
  }, iosCustomAdjustableElements)
  assert.strictEqual(iosCustomAdjustableElements[0].semantic?.semantic_role, 'custom_adjustable')
  assert.strictEqual(iosCustomAdjustableElements[0].semantic?.adjustable, true)
  assert.deepStrictEqual(iosCustomAdjustableElements[0].semantic?.supported_actions, ['adjust'])
  assert.strictEqual(iosCustomAdjustableElements[0].semantic?.state_shape, 'continuous')

  const iosFallbackElements: any[] = []
  traverseIDBNode({
    AXElementType: 'Button',
    AXLabel: 'Save',
    AXTraits: ['UIAccessibilityTraitButton'],
    AXUniqueId: 'fallback_unique_id'
  }, iosFallbackElements)

  assert.strictEqual(iosFallbackElements.length, 1)
  assert.strictEqual(iosFallbackElements[0].stable_id, 'fallback_unique_id')

  console.log('state extraction tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
