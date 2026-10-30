import type { Metadata } from 'sharp'
interface EncodedScreenshot { screenshot: string; screenshot_mime: string; screenshot_fallback?: string | null; screenshot_fallback_mime?: string }
async function convert(buffer: Buffer, platform: 'android' | 'ios') {
  const { default: sharp } = await import('sharp')
  const image = sharp(buffer)
  const meta = await image.metadata().catch((error: unknown) => {
    console.error(platform === 'android' ? 'sharp.metadata failed (Android):' : 'sharp.metadata failed:', error)
    return {} as Metadata
  })
  const hasAlpha = !!meta.hasAlpha || !!(meta.channels && meta.channels > 3)
  let webp: Buffer | null = null, jpeg: Buffer | null = null
  try { webp = await image.webp({ quality: 80 }).toBuffer() }
  catch (error) { console.error(`WebP conversion failed (${platform === 'android' ? 'Android' : 'iOS'}):`, error instanceof Error ? error.message : String(error)) }
  try { jpeg = await image.jpeg({ quality: 80 }).toBuffer() }
  catch (error) { console.error(`JPEG conversion failed (${platform === 'android' ? 'Android' : 'iOS'}):`, error instanceof Error ? error.message : String(error)) }
  return { hasAlpha, webp, jpeg }
}
export async function encodeScreenshot(buffer: Buffer, platform: 'android' | 'ios'): Promise<EncodedScreenshot> {
  const png = buffer.toString('base64')
  try {
    const { hasAlpha, webp, jpeg } = await convert(buffer, platform)
    if (webp) {
      if (hasAlpha && platform === 'ios') return { screenshot: webp.toString('base64'), screenshot_mime: 'image/webp', screenshot_fallback: png, screenshot_fallback_mime: 'image/png' }
      const fallback = jpeg ? jpeg.toString('base64') : platform === 'android' ? null : undefined
      return { screenshot: webp.toString('base64'), screenshot_mime: 'image/webp', screenshot_fallback: fallback, screenshot_fallback_mime: jpeg ? 'image/jpeg' : undefined }
    }
    if (!hasAlpha && jpeg) return { screenshot: jpeg.toString('base64'), screenshot_mime: 'image/jpeg' }
  } catch (error) {
    console.error(`Screenshot conversion pipeline failed (${platform === 'android' ? 'Android' : 'iOS'}):`, error instanceof Error ? error.message : String(error))
  }
  return { screenshot: png, screenshot_mime: 'image/png' }
}
