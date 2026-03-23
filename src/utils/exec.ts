import { spawn } from 'child_process'

export type ExecOptions = { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string; shell?: boolean }

export async function execCmd(cmd: string, args: string[], opts: ExecOptions = {}): Promise<{ exitCode: number | null, stdout: string, stderr: string }> {
  const { timeout = 0, env, cwd, shell } = opts
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...(env || {}) }, cwd, shell })
    let stdout = ''
    let stderr = ''
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d.toString() })
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString() })

    let timedOut = false
    const timer = timeout && timeout > 0 ? setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { }
      resolve({ exitCode: null, stdout: stdout.trim(), stderr: stderr.trim() })
    }, timeout) : null

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) return
      resolve({ exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() })
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
  })
}

export async function execWithRetries(cmd: string, args: string[], opts: ExecOptions = {}, retries = 1, backoffMs = 200) {
  let last: { exitCode: number | null, stdout: string, stderr: string } | null = null
  for (let i = 0; i < Math.max(1, retries); i++) {
    const res = await execCmd(cmd, args, opts)
    last = res
    if (res.exitCode === 0) return res
    if (i < retries - 1) await new Promise(r => setTimeout(r, backoffMs * (i + 1)))
  }
  return last
}
