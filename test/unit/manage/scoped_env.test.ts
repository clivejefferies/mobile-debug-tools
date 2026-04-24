import assert from 'assert'
import { ToolsManage } from '../../../src/manage/index.js'
import { AndroidManage } from '../../../src/manage/android.js'
import { iOSManage } from '../../../src/manage/ios.js'

async function run() {
  const originalAndroidBuild = AndroidManage.prototype.build
  const originalIOSBuild = iOSManage.prototype.build
  const originalGradleWorkers = process.env.MCP_GRADLE_WORKERS
  const originalGradleCache = process.env.MCP_GRADLE_CACHE
  const originalForceCleanAndroid = process.env.MCP_FORCE_CLEAN_ANDROID
  const originalDerivedData = process.env.MCP_DERIVED_DATA
  const originalXcodeJobs = process.env.MCP_XCODE_JOBS
  const originalForceCleanIOS = process.env.MCP_FORCE_CLEAN
  const originalDestination = process.env.MCP_XCODE_DESTINATION_UDID

  try {
    process.env.MCP_GRADLE_WORKERS = 'ambient-workers'
    process.env.MCP_GRADLE_CACHE = 'ambient-cache'
    process.env.MCP_FORCE_CLEAN_ANDROID = 'ambient-force-android'
    process.env.MCP_DERIVED_DATA = '/tmp/ambient-derived'
    process.env.MCP_XCODE_JOBS = 'ambient-xcode-jobs'
    process.env.MCP_FORCE_CLEAN = 'ambient-force-ios'
    process.env.MCP_XCODE_DESTINATION_UDID = 'ambient-destination'

    let androidCalls = 0
    AndroidManage.prototype.build = async function () {
      androidCalls += 1
      if (androidCalls === 1) {
        assert.strictEqual(process.env.MCP_GRADLE_WORKERS, '3')
        assert.strictEqual(process.env.MCP_GRADLE_CACHE, '0')
        assert.strictEqual(process.env.MCP_FORCE_CLEAN_ANDROID, '1')
      } else {
        assert.strictEqual(process.env.MCP_GRADLE_WORKERS, 'ambient-workers')
        assert.strictEqual(process.env.MCP_GRADLE_CACHE, 'ambient-cache')
        assert.strictEqual(process.env.MCP_FORCE_CLEAN_ANDROID, 'ambient-force-android')
      }
      return { artifactPath: '/tmp/fake.apk' }
    }

    let iosCalls = 0
    iOSManage.prototype.build = async function () {
      iosCalls += 1
      if (iosCalls === 1) {
        assert.strictEqual(process.env.MCP_DERIVED_DATA, '/tmp/derived')
        assert.strictEqual(process.env.MCP_XCODE_JOBS, '4')
        assert.strictEqual(process.env.MCP_FORCE_CLEAN, '1')
        assert.strictEqual(process.env.MCP_XCODE_DESTINATION_UDID, 'booted')
      } else if (iosCalls === 2) {
        assert.strictEqual(process.env.MCP_DERIVED_DATA, '/tmp/ambient-derived')
        assert.strictEqual(process.env.MCP_XCODE_JOBS, 'ambient-xcode-jobs')
        assert.strictEqual(process.env.MCP_FORCE_CLEAN, 'ambient-force-ios')
        assert.strictEqual(process.env.MCP_XCODE_DESTINATION_UDID, 'ambient-destination')
      } else {
        assert.strictEqual(process.env.MCP_DERIVED_DATA, '/tmp/ambient-derived')
        assert.strictEqual(process.env.MCP_XCODE_JOBS, 'ambient-xcode-jobs')
        assert.strictEqual(process.env.MCP_FORCE_CLEAN, '0')
        assert.strictEqual(process.env.MCP_XCODE_DESTINATION_UDID, 'ambient-destination')
      }
      return { artifactPath: '/tmp/Fake.app' }
    }

    await ToolsManage.build_android({
      projectPath: '/tmp/project',
      maxWorkers: 3,
      gradleCache: false,
      forceClean: true
    })

    await ToolsManage.build_ios({
      projectPath: '/tmp/project',
      derivedDataPath: '/tmp/derived',
      buildJobs: 4,
      forceClean: true,
      destinationUDID: 'booted'
    })

    await ToolsManage.build_android({
      projectPath: '/tmp/project'
    })

    await ToolsManage.build_ios({
      projectPath: '/tmp/project'
    })

    await ToolsManage.build_ios({
      projectPath: '/tmp/project',
      forceClean: false
    })

    assert.strictEqual(process.env.MCP_GRADLE_WORKERS, 'ambient-workers')
    assert.strictEqual(process.env.MCP_GRADLE_CACHE, 'ambient-cache')
    assert.strictEqual(process.env.MCP_FORCE_CLEAN_ANDROID, 'ambient-force-android')
    assert.strictEqual(process.env.MCP_DERIVED_DATA, '/tmp/ambient-derived')
    assert.strictEqual(process.env.MCP_XCODE_JOBS, 'ambient-xcode-jobs')
    assert.strictEqual(process.env.MCP_FORCE_CLEAN, 'ambient-force-ios')
    assert.strictEqual(process.env.MCP_XCODE_DESTINATION_UDID, 'ambient-destination')

    console.log('manage scoped env tests passed')
  } finally {
    AndroidManage.prototype.build = originalAndroidBuild
    iOSManage.prototype.build = originalIOSBuild

    if (originalGradleWorkers === undefined) delete process.env.MCP_GRADLE_WORKERS
    else process.env.MCP_GRADLE_WORKERS = originalGradleWorkers

    if (originalGradleCache === undefined) delete process.env.MCP_GRADLE_CACHE
    else process.env.MCP_GRADLE_CACHE = originalGradleCache

    if (originalForceCleanAndroid === undefined) delete process.env.MCP_FORCE_CLEAN_ANDROID
    else process.env.MCP_FORCE_CLEAN_ANDROID = originalForceCleanAndroid

    if (originalDerivedData === undefined) delete process.env.MCP_DERIVED_DATA
    else process.env.MCP_DERIVED_DATA = originalDerivedData

    if (originalXcodeJobs === undefined) delete process.env.MCP_XCODE_JOBS
    else process.env.MCP_XCODE_JOBS = originalXcodeJobs

    if (originalForceCleanIOS === undefined) delete process.env.MCP_FORCE_CLEAN
    else process.env.MCP_FORCE_CLEAN = originalForceCleanIOS

    if (originalDestination === undefined) delete process.env.MCP_XCODE_DESTINATION_UDID
    else process.env.MCP_XCODE_DESTINATION_UDID = originalDestination
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
