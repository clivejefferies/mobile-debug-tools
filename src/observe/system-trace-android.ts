import { execCmd } from '../utils/exec.js'
import { getAdbCmd } from '../utils/android/utils.js'

export const TRACE_MAX_BYTES = 32 * 1024 * 1024
export const TRACE_CATEGORIES = ['sched', 'freq', 'idle', 'am', 'wm', 'gfx', 'view', 'input']
export interface TraceCapabilities {
  supported: boolean; backend: 'perfetto'; device: { platform: string; id: string } | null
  prerequisites: Record<string, boolean>; reasons: string[]; enabled_sources: string[]; unavailable_categories: string[]; limitations: string[]
}
export interface TraceProcess { pid: number; startTime: string }
export interface TraceNative {
  capabilities(deviceId: string): Promise<TraceCapabilities>
  start(deviceId: string, remote: string, duration: number, categories: string[]): Promise<void>
  find(deviceId: string, remote: string): Promise<TraceProcess | null>
  stop(deviceId: string, remote: string, owner: TraceProcess): Promise<void>
  pull(deviceId: string, remote: string, local: string): Promise<void>
  remove(deviceId: string, remote: string): Promise<void>
}

// Encode only this fixed preset using the public Perfetto proto field numbers:
// https://github.com/google/perfetto/tree/main/protos/perfetto/config
// Avoid --txt (explicitly unstable), arbitrary configuration and extra tooling.
function varint(n: number): Buffer {
  const bytes: number[] = []
  do { const byte = n % 128; n = Math.floor(n / 128); bytes.push(byte | (n ? 128 : 0)) } while (n)
  return Buffer.from(bytes)
}
const uint = (field: number, n: number) => Buffer.concat([varint(field * 8), varint(n)])
const message = (field: number, value: Buffer | string) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes])
}
export function traceConfig(duration: number, categories: string[]): Buffer {
  const ftrace = Buffer.concat(categories.map(cat => message(2, cat)))
  const source = Buffer.concat([message(1, 'linux.ftrace'), message(100, ftrace)])
  return Buffer.concat([
    message(1, Buffer.concat([uint(1, 16384), uint(4, 1)])),
    message(2, message(1, source)), uint(3, duration), uint(8, 1), uint(10, TRACE_MAX_BYTES)
  ])
}
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`
function ownedPath(remote: string) {
  if (!/^\/data\/misc\/perfetto-traces\/mcp-[0-9a-f-]{36}\.perfetto-trace$/.test(remote)) throw new Error('Invalid owned trace path')
}

export class AndroidTraceNative implements TraceNative {
  constructor(private execute: typeof execCmd = execCmd) {}
  private async command(device: string, args: string[], timeout = 10000) {
    const result = await this.execute(getAdbCmd(), ['-s', device, ...args], { timeout })
    if (result.exitCode !== 0) throw new Error(result.stderr === 'ACTION_TIMEOUT' ? 'ACTION_TIMEOUT' : 'ADB_TRACE_COMMAND_FAILED')
    return result.stdout
  }
  private shell(device: string, script: string, timeout?: number) {
    return this.command(device, ['shell', 'sh', '-c', quote(script)], timeout)
  }
  async capabilities(deviceId: string): Promise<TraceCapabilities> {
    const checks: Record<string, boolean> = {}
    const probe = async (name: string, fn: () => Promise<boolean>) => { try { checks[name] = await fn() } catch { checks[name] = false } }
    let help = '', categories = ''
    await probe('android_api_29', async () => Number(await this.command(deviceId, ['shell', 'getprop', 'ro.build.version.sdk'])) >= 29)
    await probe('perfetto', async () => { const result = await this.execute(getAdbCmd(), ['-s', deviceId, 'shell', 'perfetto', '--help'], { timeout: 10000 }); help = result.stdout + result.stderr; return [0, 1].includes(result.exitCode!) && help.includes('Usage: perfetto') && help.includes('--background-wait') && help.includes('--config') })
    await probe('tracing_service', async () => { await this.command(deviceId, ['shell', 'perfetto', '--query']); return true })
    await probe('writable_storage', async () => { await this.shell(deviceId, 'test -w /data/misc/perfetto-traces'); return true })
    await probe('process_identity', async () => { await this.shell(deviceId, 'command -v pidof >/dev/null && test -r /proc/self/stat && test -r /proc/self/cmdline'); return true })
    await probe('base64', async () => (await this.shell(deviceId, "printf YQ== | base64 -d")) === 'a')
    await probe('required_categories', async () => {
      categories = await this.command(deviceId, ['shell', 'atrace', '--list_categories'])
      return ['sched', 'input'].every(c => new RegExp(`^\\s*${c}\\s+-`, 'm').test(categories))
    })
    const enabled = TRACE_CATEGORIES.filter(c => new RegExp(`^\\s*${c}\\s+-`, 'm').test(categories))
    return { supported: Object.values(checks).every(Boolean), backend: 'perfetto', device: { platform: 'android', id: deviceId },
      prerequisites: checks, reasons: Object.keys(checks).filter(k => !checks[k]), enabled_sources: enabled,
      unavailable_categories: TRACE_CATEGORIES.filter(c => !enabled.includes(c)), limitations: [
        'Device-wide scheduling and system annotations may contain sensitive information.',
        'Host times are not aligned with device trace clocks; source availability varies.',
        'A server crash can leave a bounded trace file on the device for manual removal.'
      ] }
  }
  async start(device: string, remote: string, duration: number, categories: string[]) {
    ownedPath(remote)
    const encoded = traceConfig(duration, categories).toString('base64')
    await this.shell(device, `umask 077; printf %s ${quote(encoded)} | base64 -d | perfetto --background-wait -c - -o ${quote(remote)}`, 35000)
  }
  // Scan only shell-owned readable processes. Exact output argv + executable name
  // binds ownership even if start acknowledgement/PID output was lost.
  async find(device: string, remote: string): Promise<TraceProcess | null> {
    ownedPath(remote)
    const output = await this.shell(device, `pids=$(pidof perfetto); rc=$?
      [ "$rc" -le 1 ] || exit 1
      for pid in $pids; do
      p=/proc/$pid
      [ -d "$p" ] || continue
      [ -r "$p/cmdline" ] || { [ ! -d "$p" ] && continue; exit 1; }
      cmd=$(tr '\\000' '\\n' < "$p/cmdline" 2>/dev/null) || { [ ! -d "$p" ] && continue; exit 1; }
      printf '%s\\n' "$cmd" | grep -Fx ${quote(remote)} >/dev/null || continue
      first=$(printf '%s\\n' "$cmd" | head -n 1)
      case "$first" in perfetto|/system/bin/perfetto) ;; *) continue ;; esac
      stat=$(cat "$p/stat" 2>/dev/null) || { [ ! -d "$p" ] && continue; exit 1; }
      rest=\${stat##*) }
      state=$(printf '%s\\n' "$rest" | awk '{print $1}')
      [ "$state" = Z ] && continue
      start=$(printf '%s\\n' "$rest" | awk '{print $20}')
      printf '%s %s\\n' "\${p##*/}" "$start"
    done`)
    if (!output) return null
    const match = /^(\d+) (\d+)$/.exec(output)
    if (!match) throw new Error('TRACE_PROCESS_IDENTITY_UNAVAILABLE')
    return { pid: Number(match[1]), startTime: match[2] }
  }
  async stop(device: string, remote: string, owner: TraceProcess) {
    ownedPath(remote)
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 1 || !/^\d+$/.test(owner.startTime)) throw new Error('TRACE_PROCESS_IDENTITY_UNAVAILABLE')
    // Recheck start time and argv in the same shell immediately before signal.
    await this.shell(device, `p=/proc/${owner.pid}
      [ -d "$p" ] || exit 0
      stat=$(cat "$p/stat") || exit 1
      rest=\${stat##*) }
      [ "$(printf '%s\\n' "$rest" | awk '{print $20}')" = ${quote(owner.startTime)} ] || exit 1
      cmd=$(tr '\\000' '\\n' < "$p/cmdline") || exit 1
      first=$(printf '%s\\n' "$cmd" | head -n 1)
      case "$first" in perfetto|/system/bin/perfetto) ;; *) exit 1 ;; esac
      printf '%s\\n' "$cmd" | grep -Fx ${quote(remote)} >/dev/null || exit 1
      kill -TERM ${owner.pid}`)
  }
  async pull(device: string, remote: string, local: string) {
    ownedPath(remote)
    // Reject oversized output before initiating transfer as well as afterwards.
    const size = Number(await this.command(device, ['shell', 'stat', '-c', '%s', remote]))
    if (!Number.isSafeInteger(size) || size <= 0 || size > TRACE_MAX_BYTES) throw new Error('TRACE_ARTIFACT_SIZE_INVALID')
    await this.command(device, ['pull', remote, local], 30000)
  }
  async remove(device: string, remote: string) { ownedPath(remote); await this.command(device, ['shell', 'rm', '-f', remote]) }
}
