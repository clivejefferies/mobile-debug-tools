import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export function command(command: string, args: string[], timeout = 30000) {
  return execFileSync(command, args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL', stdio: 'pipe' }).trim()
}
export function fixturePresent(adb: (...args: string[]) => string, app: string) {
  return adb('shell', 'pm', 'list', 'packages', app).split('\n').includes(`package:${app}`)
}

export function cleanupFixture(adb: (...args: string[]) => string, app: string, remove: boolean) {
  if (!fixturePresent(adb, app)) return false
  adb('shell', 'am', 'force-stop', app)
  if (!remove) return false
  adb('uninstall', app)
  if (fixturePresent(adb, app)) throw new Error('FIXTURE_REMOVAL_FAILED')
  return true
}

export const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
export function treeHash(root: string): string {
  const hash = createHash('sha256')
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile()) { hash.update(path.relative(root, file)); hash.update(readFileSync(file)) }
    }
  }
  visit(root)
  return hash.digest('hex')
}
function version(tool: string, args: string[]) {
  try { return command(tool, args).split('\n').filter(line => !/Installed as/.test(line)).slice(0, 3).join('\n') }
  catch { return 'unavailable' }
}
export function environment(deviceId: string, apk: string) {
  const adb = (...args: string[]) => command('adb', ['-s', deviceId, ...args])
  const connected = command('adb', ['devices']).split('\n').filter(line => /\sdevice$/.test(line.trim()))
  return {
    commit: command('git', ['rev-parse', 'HEAD']),
    working_tree: command('git', ['status', '--porcelain', '--untracked-files=all']),
    source_sha256: treeHash('src'), build_sha256: treeHash('dist'), harness_sha256: treeHash('test/device/automated/latency'), fixture_sha256: sha256(apk),
    package_version: JSON.parse(readFileSync('package.json', 'utf8')).version,
    node: process.version, host: { platform: os.platform(), release: os.release(), arch: os.arch() },
    platform: 'android', model: adb('shell', 'getprop', 'ro.product.model'),
    discovery_topology: { android_emulators: connected.filter(line => line.startsWith('emulator-')).length,
      android_other_devices: connected.filter(line => !line.startsWith('emulator-')).length },
    os: adb('shell', 'getprop', 'ro.build.version.release'), api: adb('shell', 'getprop', 'ro.build.version.sdk'),
    avd: adb('emu', 'avd', 'name').split('\n')[0], display: adb('shell', 'wm', 'size'), density: adb('shell', 'wm', 'density'),
    tool_versions: { adb: version('adb', ['version']), javac: version(process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javac') : 'javac', ['--version']), android_build_tools: '36.0.0',
      emulator: version(path.join(process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk'), 'emulator/emulator'), ['-version']),
      android_compile_platform: '36', xcode: version('xcodebuild', ['-version']), idb: version('idb', ['--version']) },
    timeouts: { setup_ms: 30000, call_ms: 300000, action_ms: 30000, wait_ms: 10000, verification_ms: 60000,
      adb_ms: Number(process.env.MCP_ADB_TIMEOUT ?? 20000) },
    ios: { journey: 'blocked: shared #89 fixture unavailable', observations: 'blocked: idb executable unavailable and no booted simulator at investigation', physical_device: 'excluded' }
  }
}
