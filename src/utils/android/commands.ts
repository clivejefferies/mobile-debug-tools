import { existsSync } from 'fs'
import path from 'path'
import { execCmd } from '../exec.js'
import { spawnSync } from 'child_process'
import type { SpawnOptions } from 'child_process'
export function findInPath(cmd: string): string | null {
  try {
    // prefer command -v for POSIX
    const res = spawnSync('command', ['-v', cmd], { encoding: 'utf8' })
    if (res.status === 0 && res.stdout) return res.stdout.trim()
  } catch (e: unknown) { console.debug(`[findInPath] command -v ${cmd} failed: ${String(e)}`) }
  try {
    const res = spawnSync('which', [cmd], { encoding: 'utf8' })
    if (res.status === 0 && res.stdout) return res.stdout.trim()
  } catch (e: unknown) { console.debug(`[findInPath] which ${cmd} failed: ${String(e)}`) }
  return null
}

export function resolveAdbCmd(): string {
  // Priority: explicit env ADB_PATH -> PATH -> known SDK locations -> fallback to 'adb'
  if (process.env.ADB_PATH && process.env.ADB_PATH.trim()) return process.env.ADB_PATH
  const found = findInPath('adb')
  if (found) return found
  const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
  if (sdkRoot) {
    const candidate = path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    if (existsSync(candidate)) return candidate
  }
  // common macOS user SDK path
  const homeSdk = path.join(process.env.HOME || '', 'Library', 'Android', 'sdk', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  if (existsSync(homeSdk)) return homeSdk
  return 'adb'
}

export function getAdbCmd() { return resolveAdbCmd() }

export function ensureAdbAvailable() {
  const adb = resolveAdbCmd()
  try {
    const res = spawnSync(adb, ['--version'], { encoding: 'utf8' })
    if (res.status === 0) {
      return { adbCmd: adb, ok: true, version: (res.stdout || res.stderr || '').trim() }
    }
    return { adbCmd: adb, ok: false, error: (res.stderr || res.stdout || '').trim() }
  } catch (err: unknown) {
    return { adbCmd: adb, ok: false, error: String(err) }
  }
}

export function getAdbArgs(args: string[], deviceId?: string): string[] {
  if (deviceId) {
    return ['-s', deviceId, ...args]
  }
  return args
}

export function getAdbTimeout(args: string[], customTimeout?: number): number {
  if (typeof customTimeout === 'number' && !isNaN(customTimeout)) return customTimeout
  const envTimeout = parseInt(process.env.MCP_ADB_TIMEOUT || process.env.ADB_TIMEOUT || '', 10)
  if (!isNaN(envTimeout) && envTimeout > 0) return envTimeout
  if (args.includes('logcat')) return 10000
  if (args.includes('uiautomator') && args.includes('dump')) return 20000
  return 120000
}

export type SpawnOptionsWithTimeout = SpawnOptions & { timeout?: number }

export async function execAdb(args: string[], deviceId?: string, options: SpawnOptionsWithTimeout = {}): Promise<string> {
  const adbArgs = getAdbArgs(args, deviceId)
  const timeoutMs = getAdbTimeout(args, options.timeout)
  const res = await execCmd(getAdbCmd(), adbArgs, { timeout: timeoutMs, env: options.env, cwd: typeof options.cwd === 'string' ? options.cwd : undefined, shell: !!options.shell })
  if (res.exitCode !== 0) throw new Error(res.stderr || `Command failed with code ${res.exitCode}`)
  return res.stdout
}

export async function spawnAdb(args: string[], deviceId?: string, options: SpawnOptionsWithTimeout = {}): Promise<{ stdout: string, stderr: string, code: number | null }> {
  const adbArgs = getAdbArgs(args, deviceId)
  const timeoutMs = getAdbTimeout(args, options.timeout)
  const res = await execCmd(getAdbCmd(), adbArgs, { timeout: timeoutMs, env: options.env, cwd: typeof options.cwd === 'string' ? options.cwd : undefined, shell: !!options.shell })
  return { stdout: res.stdout, stderr: res.stderr, code: res.exitCode }
}
