import { spawn, type ChildProcess } from 'node:child_process'

export interface TraceCommandResult { code: number | null; output: string; timedOut: boolean }
export interface OwnedTraceChild {
  done: Promise<TraceCommandResult>
  alive(): boolean
  signal(signal: NodeJS.Signals): void
  line(text: string, timeout: number): Promise<void>
}
export type TraceSpawn = (command: string, args: string[], timeout: number) => OwnedTraceChild
const MAX_OUTPUT = 64 * 1024

export const spawnTrace: TraceSpawn = (command, args, timeout) => {
  const child: ChildProcess = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', settled = false, timedOut = false
  const waiters = new Set<() => void>()
  let force: ReturnType<typeof setTimeout> | undefined
  const terminate = () => {
    if (settled) return
    child.kill('SIGTERM')
    force ??= setTimeout(() => { if (!settled) child.kill('SIGKILL') }, 1000)
    force.unref()
  }
  const timer = setTimeout(() => { timedOut = true; terminate() }, timeout)
  timer.unref()
  const done = new Promise<TraceCommandResult>(resolve => {
    const finish = (code: number | null) => {
      if (settled) return
      settled = true; clearTimeout(timer); if (force) clearTimeout(force)
      for (const wake of waiters) wake()
      resolve({ code, output, timedOut })
    }
    child.on('error', () => finish(null))
    child.on('close', finish)
    const data = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-MAX_OUTPUT)
      for (const wake of waiters) wake()
    }
    child.stdout?.on('data', data); child.stderr?.on('data', data)
  })
  return {
    done, alive: () => !settled && child.exitCode === null && child.signalCode === null,
    signal: signal => { if (!settled) child.kill(signal) },
    line: (text, ms) => new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => { waiters.delete(check); reject(new Error('READINESS_TIMEOUT')) }, ms)
      const check = () => {
        if (output.split(/\r?\n/).includes(text)) { clearTimeout(deadline); waiters.delete(check); resolve() }
        else if (settled) { clearTimeout(deadline); waiters.delete(check); reject(new Error('RECORDER_EXITED')) }
      }
      waiters.add(check); check()
    })
  }
}

export async function traceCommand(command: string, args: string[], timeout = 10000, spawn: TraceSpawn = spawnTrace) {
  const result = await spawn(command, args, timeout).done
  if (result.code !== 0 || result.timedOut) throw new Error(result.timedOut ? 'ACTION_TIMEOUT' : 'COMMAND_FAILED')
  return result.output.trim()
}
export async function stopTraceChild(child: OwnedTraceChild, timeout = 30000) {
  if (child.alive()) child.signal('SIGINT')
  let timer: ReturnType<typeof setTimeout> | undefined
  const result = await Promise.race([
    child.done,
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeout) })
  ])
  if (timer) clearTimeout(timer)
  if (result) return result
  child.signal('SIGKILL')
  let forceTimer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([child.done, new Promise<void>(resolve => { forceTimer = setTimeout(resolve, 1000) })])
  if (forceTimer) clearTimeout(forceTimer)
  throw new Error('ACTION_TIMEOUT')
}

export function classifyTraceFailure(result: TraceCommandResult): string {
  if (result.timedOut) return 'ACTION_TIMEOUT'
  if (/permission|not permitted|authoriz|privacy|access denied/i.test(result.output)) return 'PROFILING_PERMISSION_REQUIRED'
  if (/cannot find process|process.*not.*found/i.test(result.output)) return 'APP_NOT_RUNNING'
  if (/disconnect|device.*unavailable/i.test(result.output)) return 'TARGET_DISCONNECTED'
  return 'RECORDER_EXITED'
}
