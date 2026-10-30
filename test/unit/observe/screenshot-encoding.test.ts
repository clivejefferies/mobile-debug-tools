import assert from 'node:assert/strict'
import sharp from 'sharp'
import { encodeScreenshot } from '../../../src/observe/screenshot-encoding.js'

async function run() {
  const alpha = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()
  const opaque = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
  for (const platform of ['android', 'ios'] as const) {
    const transparent = await encodeScreenshot(alpha, platform)
    assert.equal(transparent.screenshot_mime, 'image/webp')
    assert.equal((await sharp(Buffer.from(transparent.screenshot, 'base64')).metadata()).hasAlpha, true)
    assert.equal(transparent.screenshot_fallback_mime, platform === 'ios' ? 'image/png' : 'image/jpeg')
    if (platform === 'ios') assert.equal(transparent.screenshot_fallback, alpha.toString('base64'))
    const solid = await encodeScreenshot(opaque, platform)
    assert.equal(solid.screenshot_mime, 'image/webp')
    assert.equal(solid.screenshot_fallback_mime, 'image/jpeg')
    assert.equal((await sharp(Buffer.from(solid.screenshot_fallback!, 'base64')).metadata()).format, 'jpeg')
  }
  // An unreadable capture must survive conversion failures unchanged.
  const invalid = Buffer.from('unreadable screenshot')
  const originalError = console.error
  try {
    console.error = () => {}
    for (const platform of ['android', 'ios'] as const) {
      assert.deepEqual(await encodeScreenshot(invalid, platform), { screenshot: invalid.toString('base64'), screenshot_mime: 'image/png' })
    }
  } finally { console.error = originalError }
  console.log('Screenshot alpha, fallback format and failed conversion tests passed')
}
run().catch(error => { console.error(error); process.exit(1) })
