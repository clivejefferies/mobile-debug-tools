import { execSync, spawnSync } from 'child_process'
import fs from 'fs'

export function getConfiguredIdbPath(): string | undefined {
  if (process.env.MCP_IDB_PATH) return process.env.MCP_IDB_PATH
  if (process.env.IDB_PATH) return process.env.IDB_PATH
  const cfgPaths = [
    process.env.MCP_CONFIG_PATH || (process.env.HOME ? `${process.env.HOME}/.mcp/config.json` : ''),
    `${process.cwd()}/mcp.config.json`
  ]
  for (const p of cfgPaths) {
    if (!p) continue
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8')
        const json = JSON.parse(raw)
        if (json?.idbPath) return json.idbPath
        if (json?.IDB_PATH) return json.IDB_PATH
      }
    } catch { }
  }
  return undefined
}

export function commandWhich(cmd: string): string | null {
  try {
    const r = spawnSync('command', ['-v', cmd], { stdio: ['ignore', 'pipe', 'ignore'] })
    if (r && r.status === 0 && r.stdout) return r.stdout.toString().trim()
  } catch { }
  try {
    const p = execSync(`which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (p) return p
  } catch { }
  return null
}

export function getIdbCmd(): string | null {
  const cfg = getConfiguredIdbPath()
  if (cfg) return cfg
  if (process.env.IDB_PATH) return process.env.IDB_PATH

  // Prefer command -v/which
  const found = commandWhich('idb')
  if (found) return found

  // Common locations
  const common = [
    process.env.HOME ? `${process.env.HOME}/Library/Python/3.9/bin/idb` : '',
    process.env.HOME ? `${process.env.HOME}/Library/Python/3.10/bin/idb` : '',
    '/opt/homebrew/bin/idb',
    '/usr/local/bin/idb'
  ]
  for (const c of common) {
    if (!c) continue
    try { execSync(`test -x ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }); return c } catch { }
  }
  return null
}

export function getIdbPackageVersion(): string | null {
  const runners = ['python3', 'python']
  for (const runner of runners) {
    try {
      const result = spawnSync(runner, ['-m', 'pip', 'show', 'fb-idb'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      if (result.status !== 0) continue
      const output = `${result.stdout || ''}\n${result.stderr || ''}`
      const match = output.match(/^Version:\s*(.+)$/mi)
      if (match?.[1]) return match[1].trim()
    } catch {
      continue
    }
  }
  return null
}

export function probeIdb(cmd = getIdbCmd()): { ok: boolean; raw: string | null; parsedVersion: string | null } {
  if (!cmd) return { ok: false, raw: null, parsedVersion: null }

  try {
    const result = spawnSync(cmd, ['list-targets', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000
    })
    if (result.status !== 0) {
      return {
        ok: false,
        raw: `${result.stdout || ''}${result.stderr || ''}`.trim() || null,
        parsedVersion: null
      }
    }

    const version = getIdbPackageVersion()
    const raw = version ? `fb-idb ${version}` : `${result.stdout || ''}${result.stderr || ''}`.trim() || null
    return {
      ok: true,
      raw,
      parsedVersion: version
    }
  } catch {
    return { ok: false, raw: null, parsedVersion: null }
  }
}

export function isIDBInstalled(): boolean {
  return probeIdb().ok
}
