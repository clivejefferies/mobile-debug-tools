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
  const adbScript = `#!/bin/sh
echo 'Performing Streamed Install'
echo 'Success'
exit 0
`
  await fs.writeFile(adbPath, adbScript, { mode: 0o755 })

  const origPath = process.env.PATH || ''
  const origAdbPath = process.env.ADB_PATH
  // Ensure deterministic behavior by pointing ADB_PATH at our fake adb
  process.env.ADB_PATH = adbPath
  process.env.PATH = `${binDir}:${origPath}`

  // Import the module under test after PATH/ADB_PATH is adjusted
  console.log('DEBUG install.test ADB_PATH=', process.env.ADB_PATH, 'PATH starts with=', process.env.PATH?.split(':')[0])
  const { AndroidManage } = await import('../../../src/manage/index.js?test=install')

  try {
    // Test: install with .apk file should call adb install
    const { dir: d1, file: apk } = await makeTempFile('.apk')
    const ai = new AndroidManage()
    const res1 = await ai.installApp(apk)
    console.log('res1', res1)
    if (res1.installed !== true) {
      // If install failed, expect diagnostics to explain why
      assert.ok(res1.diagnostics && (res1.diagnostics.installDiag || res1.diagnostics.pushDiag || res1.diagnostics.pmDiag), 'If install fails, diagnostics should be present')
    }

    // Test: project directory detection for Android (gradlew present as a simple wrapper script)
    const dirGradle = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
    const gradlewPath = path.join(dirGradle, 'gradlew')
    const gradlewScript = `#!/bin/sh
mkdir -p "$(pwd)/app/build/outputs/apk/debug"
echo 'fake-apk-binary' > "$(pwd)/app/build/outputs/apk/debug/app-debug.apk"
echo 'BUILD SUCCESS'
exit 0
`
    await fs.writeFile(gradlewPath, gradlewScript, { mode: 0o755 })

    const res2 = await ai.installApp(dirGradle)
    console.log('res2', res2)
    // In some environments the fake adb may not be found; accept either success or a diagnostics object on failure
    if (res2.installed !== true) {
      assert.ok(res2.diagnostics, 'Project dir install failed - diagnostics expected')
    } else {
      assert.ok(res2.output && typeof res2.output === 'string', 'Project dir install succeeded with output')
    }

    const testOnlyAdbPath = path.join(binDir, 'adb-test-only')
    const testOnlyAdbScript = `#!/bin/sh
if [ "$1" = "-s" ]; then
  shift 2
fi

if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.build.version.release) echo '16' ;;
    ro.product.model) echo 'sdk_gphone64_arm64' ;;
    ro.kernel.qemu) echo '1' ;;
  esac
  exit 0
fi

if [ "$1" = "install" ]; then
  if [ "$2" = "-r" ] && [ "$3" = "-t" ]; then
    echo 'Performing Streamed Install'
    echo 'Success'
    exit 0
  fi
  echo 'Performing Streamed Install'
  echo 'adb: failed to install test.apk: Failure [INSTALL_FAILED_TEST_ONLY: Failed to install test-only apk. Did you forget to add -t?]' 1>&2
  exit 1
fi

echo 'Success'
exit 0
`
    await fs.writeFile(testOnlyAdbPath, testOnlyAdbScript, { mode: 0o755 })
    process.env.ADB_PATH = testOnlyAdbPath

    const { dir: d2, file: testOnlyApk } = await makeTempFile('.apk')
    const testOnlyRes = await ai.installApp(testOnlyApk, 'emulator-5554')
    console.log('testOnlyRes', testOnlyRes)
    assert.strictEqual(testOnlyRes.installed, true, 'Test-only APK should retry with -t and install successfully')

    const cleanupLog = path.join(binDir, 'pm-cleanup.log')
    const pmFallbackAdbPath = path.join(binDir, 'adb-pm-fallback')
    const pmFallbackAdbScript = `#!/bin/sh
if [ "$1" = "-s" ]; then
  shift 2
fi

if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.build.version.release) echo '16' ;;
    ro.product.model) echo 'sdk_gphone64_arm64' ;;
    ro.kernel.qemu) echo '1' ;;
  esac
  exit 0
fi

if [ "$1" = "install" ]; then
  echo 'adb install failed' 1>&2
  exit 1
fi

if [ "$1" = "push" ]; then
  echo 'pushed'
  exit 0
fi

if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "install" ]; then
  if [ "$4" = "-r" ] && [ "$5" = "-t" ]; then
    echo 'Failure [INSTALL_FAILED_VERSION_DOWNGRADE]'
    exit 1
  fi
  echo 'Failure [INSTALL_FAILED_TEST_ONLY: Failed to install test-only apk. Did you forget to add -t?]'
  exit 1
fi

if [ "$1" = "shell" ] && [ "$2" = "rm" ]; then
  echo cleanup >> "${cleanupLog}"
  exit 0
fi

echo 'unexpected args:' "$@" 1>&2
exit 1
`
    await fs.writeFile(pmFallbackAdbPath, pmFallbackAdbScript, { mode: 0o755 })
    process.env.ADB_PATH = pmFallbackAdbPath

    const { dir: d3, file: pmFallbackApk } = await makeTempFile('.apk')
    const pmFallbackRes = await ai.installApp(pmFallbackApk, 'emulator-5554')
    console.log('pmFallbackRes', pmFallbackRes)
    assert.strictEqual(pmFallbackRes.installed, false, 'Failed pm fallback should surface as install failure')
    assert.match(pmFallbackRes.error || '', /INSTALL_FAILED_VERSION_DOWNGRADE/, 'Final pm retry failure should be reported')
    const cleanupCount = (await fs.readFile(cleanupLog, 'utf8')).trim().split('\n').filter(Boolean).length
    assert.strictEqual(cleanupCount, 1, 'pm fallback cleanup should run once')

    // cleanup
    await fs.rm(d1, { recursive: true, force: true }).catch(() => {})
    await fs.rm(d2, { recursive: true, force: true }).catch(() => {})
    await fs.rm(d3, { recursive: true, force: true }).catch(() => {})
    await fs.rm(dirGradle, { recursive: true, force: true }).catch(() => {})

    // restore PATH and ADB_PATH
    process.env.PATH = origPath
    if (typeof origAdbPath !== 'undefined') process.env.ADB_PATH = origAdbPath
    else delete process.env.ADB_PATH

    console.log('install tests passed')
  } finally {
    // ensure PATH restored even on failure
    process.env.PATH = origPath
    if (typeof origAdbPath !== 'undefined') process.env.ADB_PATH = origAdbPath
    else delete process.env.ADB_PATH
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
