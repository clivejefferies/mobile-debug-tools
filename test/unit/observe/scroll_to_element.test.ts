import { AndroidInteract } from '../../../src/interact/index.js'
import assert from 'assert'

async function runTests() {
  console.log = (...args: any[]) => { try { process.stdout.write(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n') } catch {} }
  console.log('Starting tests for scroll_to_element...')

  const ai = new AndroidInteract()
  const origObserveGet = ai['observe'].getUITree
  const origSwipe = ai.swipe

  try {
    console.log('\nTest 1: Element found immediately')
    ;(ai['observe'] as any).getUITree = async () => ({
      device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: [{
        text: 'Target',
        type: 'Button',
        contentDescription: null,
        clickable: true,
        enabled: true,
        visible: true,
        bounds: [0, 0, 100, 100],
        resourceId: null
      }]
    })

    const res1 = await ai.scrollToElement({ text: 'Target' }, 'down', 5, 0.7, 'mock')
    assert.strictEqual(res1.success, true, 'Element visible on first screen should be found immediately')
    console.log('Result: PASS')
    console.log('scrollsPerformed:', (res1 as any).scrollsPerformed)

    console.log('\nTest 2: Element found after scrolling')
    let calls = 0
    ;(ai['observe'] as any).getUITree = async () => {
      calls++
      if (calls < 3) {
        return {
          device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true },
          screen: '',
          resolution: { width: 1080, height: 1920 },
          elements: [{
            text: `Placeholder ${calls}`,
            type: 'TextView',
            contentDescription: null,
            clickable: false,
            enabled: true,
            visible: true,
            bounds: [0, calls * 10, 100, calls * 10 + 20],
            resourceId: `placeholder-${calls}`
          }]
        }
      }

      return {
        device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true },
        screen: '',
        resolution: { width: 1080, height: 1920 },
        elements: [{
          text: 'Target',
          type: 'Button',
          contentDescription: null,
          clickable: true,
          enabled: true,
          visible: true,
          bounds: [0, 0, 100, 100],
          resourceId: null
        }]
      }
    }
    ;(ai as any).swipe = async () => ({ success: true })

    const res2 = await ai.scrollToElement({ text: 'Target' }, 'down', 5, 0.7, 'mock')
    assert.strictEqual(res2.success, true, 'Element found after scrolling should succeed')
    assert.ok(calls >= 3, 'scroll_to_element should retry until the target appears')
    console.log('Result: PASS')
    console.log('calls:', calls)

    console.log('\nTest 3: UI unchanged stops early')
    ;(ai['observe'] as any).getUITree = async () => ({
      device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true },
      screen: '',
      resolution: { width: 1080, height: 1920 },
      elements: []
    })
    ;(ai as any).swipe = async () => ({ success: true })

    const res3 = await ai.scrollToElement({ text: 'Missing' }, 'down', 5, 0.7, 'mock')
    assert.ok(res3.success === false && (res3 as any).scrollsPerformed === 1, 'Unchanged UI should stop early after the first unchanged scroll')
    console.log('Result: PASS')
    console.log('Reason:', (res3 as any).reason || JSON.stringify(res3))

    console.log('\nTest 4: Offscreen element scrolls into view')
    let swiped = false
    let swipeCalled = 0
    ;(ai['observe'] as any).getUITree = async () => {
      if (!swiped) {
        return {
          device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true },
          screen: '',
          resolution: { width: 1080, height: 1920 },
          elements: [{ text: null, type: 'android.view.View', resourceId: null, contentDescription: null, bounds: [0, 0, 1080, 200], visible: true }]
        }
      }

      return {
        device: { platform: 'android', id: 'mock', osVersion: '12', model: 'Pixel', simulator: true },
        screen: '',
        resolution: { width: 1080, height: 1920 },
        elements: [{ text: 'OffscreenTarget', type: 'android.widget.Button', contentDescription: null, clickable: true, enabled: true, visible: true, bounds: [100, 400, 300, 460], resourceId: null }]
      }
    }
    ;(ai as any).swipe = async () => { swipeCalled++; swiped = true; return { success: true } }

    const res4 = await ai.scrollToElement({ text: 'OffscreenTarget' }, 'down', 3, 0.7, 'mock')
    assert.ok(res4 && (res4 as any).success === true && (res4 as any).scrollsPerformed === 1 && swipeCalled === 1, 'Offscreen target should be found after one swipe')
    console.log('Result: PASS')
    console.log('  success:', (res4 as any).success, 'scrollsPerformed:', (res4 as any).scrollsPerformed, 'swipeCalled:', swipeCalled)
  } finally {
    ;(ai['observe'] as any).getUITree = origObserveGet
    ;(ai as any).swipe = origSwipe
  }
}

runTests().catch((error) => { console.error(error); process.exit(1) })
