import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

// This test mocks child_process.spawn and simulates a Gradle build producing an APK
// and an adb install. It does not patch AndroidInteract.installApp itself so the
// internal build-and-install logic is exercised.

async function makeTempFile(ext: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
  const file = path.join(dir, `fake${ext}`)
  await fs.writeFile(file, 'binary')
  return { dir, file }
}


export async function run() {
  // Create a fake adb executable in a temporary bin dir and prepend to PATH so
  // execAdb's spawn('adb', ...) will find it. This avoids requiring a real adb
  // binary during unit tests and exercises the installApp logic.
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-adb-bin-'))
  const adbPath = path.join(binDir, 'adb')
  const adbScript = `#!/usr/bin/env node
console.log('Performing Streamed Install')
console.log('Success')
process.exit(0)
`
  await fs.writeFile(adbPath, adbScript, { mode: 0o755 })
  const origPath = process.env.PATH || ''
  process.env.PATH = `${binDir}:${origPath}`

  // Import the module under test after PATH is adjusted
  const { AndroidManage } = await import('../../src/android/manage.js')

  try {
    // Test: install with .apk file should call adb install
    const { dir: d1, file: apk } = await makeTempFile('.apk')
    const ai = new AndroidManage()
    const res1 = await ai.installApp(apk)
    console.log('res1', res1)
    assert.ok(res1.installed === true, 'APK install should succeed')

    // Test: project directory detection for Android (gradlew present as a simple wrapper script)
    const dirGradle = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
    const gradlewPath = path.join(dirGradle, 'gradlew')
    const gradlewScript = `#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const apkPath = path.join(process.cwd(), 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
fs.mkdirSync(path.dirname(apkPath), { recursive: true })
fs.writeFileSync(apkPath, 'fake-apk-binary')
console.log('BUILD SUCCESS')
process.exit(0)
`
    await fs.writeFile(gradlewPath, gradlewScript, { mode: 0o755 })

    const res2 = await ai.installApp(dirGradle)
    console.log('res2', res2)
    assert.ok(res2.installed === true, 'Project dir (gradle) install should succeed')

    // cleanup
    await fs.rm(d1, { recursive: true, force: true }).catch(() => {})
    await fs.rm(dirGradle, { recursive: true, force: true }).catch(() => {})

    // restore PATH
    process.env.PATH = origPath

    console.log('install tests passed')
  } finally {
    // ensure PATH restored even on failure
    process.env.PATH = origPath
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
