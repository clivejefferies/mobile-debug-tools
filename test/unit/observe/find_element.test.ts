import { ToolsInteract } from '../../../src/interact/index.js'
import { ToolsObserve } from '../../../src/observe/index.js'
import assert from 'assert'

async function run() {
  process.stdout.write('Starting find_element unit tests...\n')

  const origGetTree = (ToolsObserve as any).getUITreeHandler

  try {
    // Test 1: exact text match
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        { text: 'Login', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [10,10,100,60], resourceId: 'btn_login' },
        { text: 'Cancel', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [110,10,200,60], resourceId: 'btn_cancel' }
      ]
    })

    const res1: any = await ToolsInteract.findElementHandler({ query: 'login', exact: true, platform: 'android' })
    process.stdout.write('res1 ' + JSON.stringify(res1, null, 2) + '\n');
    const pass1 = res1.found === true && res1.element && res1.element.resourceId === 'btn_login' && res1.element.tapCoordinates && typeof res1.element.tapCoordinates.x === 'number' && typeof res1.element.tapCoordinates.y === 'number' && typeof res1.confidence === 'number'
    assert.ok(pass1, 'Exact text match should find the actionable login button')
    process.stdout.write('Test 1: ' + (pass1 ? 'PASS' : 'FAIL') + '\n');

    // Test 2: partial match & scoring
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        { text: 'Sign in', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [10,10,100,60], resourceId: 'btn_signin' },
        { text: 'Login with Email', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [110,10,300,60], resourceId: 'btn_login_email' }
      ]
    })

    const res2: any = await ToolsInteract.findElementHandler({ query: 'login', exact: false, platform: 'android' })
    process.stdout.write('res2 ' + JSON.stringify(res2, null, 2) + '\n');
    const pass2 = res2.found === true && res2.element && res2.element.resourceId === 'btn_login_email' && res2.element.tapCoordinates && typeof res2.element.tapCoordinates.x === 'number' && typeof res2.element.tapCoordinates.y === 'number' && typeof res2.confidence === 'number'
    assert.ok(pass2, 'Partial text matching should pick the best scoring element')
    process.stdout.write('Test 2: ' + (pass2 ? 'PASS' : 'FAIL') + '\n');

    // Test 3: resourceId match
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        { text: null, type: 'android.widget.ImageView', contentDescription: null, clickable: false, enabled: true, visible: true, bounds: [0,0,50,50], resourceId: 'icon_login' }
      ]
    })

    const res3: any = await ToolsInteract.findElementHandler({ query: 'icon_login', exact: false, platform: 'android' })
    process.stdout.write('res3 ' + JSON.stringify(res3, null, 2) + '\n');
    const pass3 = res3.found === true && res3.element && res3.element.resourceId === 'icon_login' && res3.element.tapCoordinates && typeof res3.element.tapCoordinates.x === 'number' && typeof res3.element.tapCoordinates.y === 'number' && typeof res3.confidence === 'number'
    assert.ok(pass3, 'Resource-id matching should find icon_login')
    process.stdout.write('Test 3: ' + (pass3 ? 'PASS' : 'FAIL') + '\n');

    // Test 4: parent-clickable child-text scenario
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        { text: null, type: 'android.view.View', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [0,0,400,100], resourceId: 'btn_generate', children: [1] },
        { text: 'Generate Session', type: 'android.widget.TextView', contentDescription: null, clickable: false, enabled: true, visible: true, bounds: [10,10,390,90], resourceId: null, parentId: 0 }
      ]
    })

    const res4: any = await ToolsInteract.findElementHandler({ query: 'generate', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res4 ' + JSON.stringify(res4, null, 2) + '\n');
    const pass4 = res4.found === true && res4.element && res4.element.clickable === true && res4.element.resourceId === 'btn_generate' && res4.element.tapCoordinates && typeof res4.element.tapCoordinates.x === 'number' && typeof res4.element.tapCoordinates.y === 'number' && typeof res4.confidence === 'number'
    assert.ok(pass4, 'Child text should resolve to a clickable parent ancestor')
    assert.strictEqual(res4.resolution?.reason, 'clickable_parent_preferred')
    assert.strictEqual(res4.resolution?.fallback_available, true)
    assert.ok((res4.resolution?.alternates || []).length >= 1, 'Parent promotion should preserve alternates')
    process.stdout.write('Test 4: ' + (pass4 ? 'PASS' : 'FAIL') + '\n');

    // Test 4b: semantic-only stepper should be discoverable by supported action
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        {
          text: null,
          contentDescription: 'Quantity stepper',
          type: 'android.widget.NumberPicker',
          clickable: false,
          enabled: true,
          visible: true,
          bounds: [10,10,200,80],
          resourceId: 'picker_quantity',
          semantic: {
            is_clickable: false,
            is_container: true,
            semantic_role: 'stepper',
            supported_actions: ['increment', 'decrement'],
            adjustable: true,
            state_shape: 'discrete'
          }
        }
      ]
    })

    const res4b: any = await ToolsInteract.findElementHandler({ query: 'increment', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res4b ' + JSON.stringify(res4b, null, 2) + '\n');
    const pass4b = res4b.found === true && res4b.element && res4b.element.resourceId === 'picker_quantity' && res4b.element.semantic?.semantic_role === 'stepper'
    assert.ok(pass4b, 'Semantic-only steppers should be discoverable by supported actions')
    assert.strictEqual(res4b.resolution?.reason, 'semantic_action_match')
    process.stdout.write('Test 4b: ' + (pass4b ? 'PASS' : 'FAIL') + '\n');

    const res4bb: any = await ToolsInteract.findElementHandler({ query: 'increment', exact: true, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res4bb ' + JSON.stringify(res4bb, null, 2) + '\n');
    const pass4bb = res4bb.found === true && res4bb.element && res4bb.element.resourceId === 'picker_quantity' && res4bb.resolution?.reason === 'semantic_action_match'
    assert.ok(pass4bb, 'Exact searches should still match exact semantic actions')
    process.stdout.write('Test 4bb: ' + (pass4bb ? 'PASS' : 'FAIL') + '\n');

    const res4c: any = await ToolsInteract.findElementHandler({ query: 'control', exact: true, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res4c ' + JSON.stringify(res4c, null, 2) + '\n');
    const pass4c = res4c.found === false
    assert.ok(pass4c, 'Exact searches should not fall back to broad semantic keywords')
    process.stdout.write('Test 4c: ' + (pass4c ? 'PASS' : 'FAIL') + '\n');

    // Test 5: duration label should resolve to the nearby slider control
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        { text: 'Duration: 5 min', type: 'android.widget.TextView', contentDescription: null, clickable: false, enabled: true, visible: true, bounds: [10,10,260,50], resourceId: null },
        { text: null, type: 'android.view.View', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [10,60,1040,140], resourceId: null }
      ]
    })

    const res5: any = await ToolsInteract.findElementHandler({ query: 'duration', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res5 ' + JSON.stringify(res5, null, 2) + '\n');
    const pass5 = res5.found === true && res5.element && res5.element.clickable === true && res5.element.bounds && res5.element.bounds.top === 60 && res5.element.bounds.bottom === 140
    assert.ok(pass5, 'Duration label should resolve to the slider control below it')
    process.stdout.write('Test 5: ' + (pass5 ? 'PASS' : 'FAIL') + '\n');

    // Test 6: prefer track-like control over a closer texty sibling
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [
        { text: 'Duration: 5 min', type: 'android.widget.TextView', contentDescription: null, clickable: false, enabled: true, visible: true, bounds: [10,10,260,50], resourceId: null },
        { text: 'Reset', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [10,60,150,120], resourceId: 'btn_reset' },
        { text: null, type: 'android.view.View', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [10,130,1040,210], resourceId: null }
      ]
    })

    const res6: any = await ToolsInteract.findElementHandler({ query: 'duration', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res6 ' + JSON.stringify(res6, null, 2) + '\n');
    const pass6 = res6.found === true && res6.element && res6.element.clickable === true && res6.element.bounds && res6.element.bounds.top === 130 && res6.element.bounds.bottom === 210
    assert.ok(pass6, 'Duration lookup should prefer the track-like control over a closer text button')
    process.stdout.write('Test 6: ' + (pass6 ? 'PASS' : 'FAIL') + '\n');
    const pass6b = res6.element && res6.element.telemetry && res6.element.telemetry.sliderLike === true && res6.element.interactionHint && res6.element.interactionHint.kind === 'slider'
    assert.ok(pass6b, 'Duration lookup should include slider-specific telemetry')
    assert.strictEqual(res6.resolution?.reason, 'slider_track_preferred')
    assert.strictEqual(res6.resolution?.fallback_available, true)
    process.stdout.write('Test 6b: ' + (pass6b ? 'PASS' : 'FAIL') + '\n');

    // Test 7: prefer vertical track-like control over a closer text button
    ;(ToolsObserve as any).getUITreeHandler = async () => ({
      device: { platform: 'android', id: 'mock' },
      screen: '',
      resolution: { width: 1080, height: 2400 },
      elements: [
        { text: 'Duration: 5 min', type: 'android.widget.TextView', contentDescription: null, clickable: false, enabled: true, visible: true, bounds: [10,10,260,50], resourceId: null },
        { text: 'Reset', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [10,60,150,120], resourceId: 'btn_reset' },
        { text: null, type: 'android.view.View', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [270,20,350,1040], resourceId: null }
      ]
    })

    const res7: any = await ToolsInteract.findElementHandler({ query: 'duration', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res7 ' + JSON.stringify(res7, null, 2) + '\n');
    const pass7 = res7.found === true && res7.element && res7.element.clickable === true && res7.element.bounds && res7.element.bounds.left === 270 && res7.element.bounds.right === 350
    assert.ok(pass7, 'Duration lookup should prefer a vertical track-like control')
    process.stdout.write('Test 7: ' + (pass7 ? 'PASS' : 'FAIL') + '\n');
    const pass7b = res7.element && res7.element.interactionHint && res7.element.interactionHint.axis === 'vertical'
    assert.ok(pass7b, 'Vertical sliders should report a vertical interaction axis')
    process.stdout.write('Test 7b: ' + (pass7b ? 'PASS' : 'FAIL') + '\n');

    // Test 8: not found
    ;(ToolsObserve as any).getUITreeHandler = async () => ({ device: { platform: 'android', id: 'mock' }, screen: '', resolution: { width: 1080, height: 1920 }, elements: [] })
    const res8: any = await ToolsInteract.findElementHandler({ query: 'nope', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res8 ' + JSON.stringify(res8, null, 2) + '\n');
    const pass8 = res8.found === false
    assert.ok(pass8, 'Missing elements should return found=false')
    process.stdout.write('Test 8: ' + (pass8 ? 'PASS' : 'FAIL') + '\n');

  } finally {
    ;(ToolsObserve as any).getUITreeHandler = origGetTree
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
