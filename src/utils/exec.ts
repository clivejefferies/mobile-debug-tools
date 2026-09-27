import { remainingBudget } from './operation-budget.js'
import { spawn } from 'child_process'

export type ExecOptions = { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string; shell?: boolean }

export async function execCmd(cmd: string, args: string[], opts: ExecOptions = {}): Promise<{ exitCode: number | null, stdout: string, stderr: string }> {
  const { env, cwd, shell } = opts
  const timeout = remainingBudget(opts.timeout ?? 0)
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...(env || {}) }, cwd, shell })
    let stdout = ''
    let stderr = ''
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d.toString() })
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString() })

    let timedOut = false
    let forceKillTimer: NodeJS.Timeout | null = null
    const timer = timeout && timeout > 0 ? setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { }
      forceKillTimer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { }
      }, 1000)
      forceKillTimer.unref()
    }, timeout) : null

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      resolve(timedOut
        ? { exitCode: null, stdout: stdout.trim(), stderr: 'ACTION_TIMEOUT' }
        : { exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() })
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      reject(err)
    })
  })
}
