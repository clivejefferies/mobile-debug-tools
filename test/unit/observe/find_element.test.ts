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
    process.stdout.write('Test 4: ' + (pass4 ? 'PASS' : 'FAIL') + '\n');

    // Test 5: not found
    ;(ToolsObserve as any).getUITreeHandler = async () => ({ device: { platform: 'android', id: 'mock' }, screen: '', resolution: { width: 1080, height: 1920 }, elements: [] })
    const res5: any = await ToolsInteract.findElementHandler({ query: 'nope', exact: false, platform: 'android', timeoutMs: 300 })
    process.stdout.write('res5 ' + JSON.stringify(res5, null, 2) + '\n');
    const pass5 = res5.found === false
    assert.ok(pass5, 'Missing elements should return found=false')
    process.stdout.write('Test 5: ' + (pass5 ? 'PASS' : 'FAIL') + '\n');

  } finally {
    ;(ToolsObserve as any).getUITreeHandler = origGetTree
  }
}

run().catch((error) => { console.error(error); process.exit(1) })
