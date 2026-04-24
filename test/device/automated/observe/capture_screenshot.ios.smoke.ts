import fs from 'fs'
import { execSync } from 'child_process'

function log(msg: string) { console.log(msg) }

if (process.env.SKIP_DEVICE_TESTS === '1') {
  log('SKIP_DEVICE_TESTS=1 detected - skipping ios screenshot smoke test')
  process.exit(0)
}

const helperScript = 'test/device/manual/observe/capture_screenshot.manual.ts'
if (!fs.existsSync(helperScript)) {
  console.error(`Missing ${helperScript}. Run 'npm run build' first or ensure the helper exists.`)
  process.exit(1)
}

try {
  const out = execSync(`tsx ${helperScript} --platform ios`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 })
  const parsed = JSON.parse(out)

  if (!parsed?.resolution || parsed.resolution.width <= 0 || parsed.resolution.height <= 0) throw new Error('Invalid screenshot resolution')
  if (typeof parsed.screenshotBytes !== 'number' || parsed.screenshotBytes <= 0) throw new Error('Screenshot payload missing')

  log('iOS capture_screenshot smoke test: PASS')
  process.exit(0)
} catch (err: any) {
  console.error('iOS capture_screenshot smoke test: FAIL')
  console.error(err && err.message ? err.message : err)
  process.exit(2)
}
