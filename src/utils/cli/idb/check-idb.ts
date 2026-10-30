#!/usr/bin/env node
import { execSync, spawnSync } from 'child_process'
import { main as installMain } from './install-idb.js'
import { getIdbCmd, getIdbPackageVersion, isIDBInstalled } from './idb-helper.js'

function which(cmd: string): string | null {
  try {
    const r = spawnSync('command', ['-v', cmd], { stdio: ['ignore', 'pipe', 'ignore'] })
    if (r && r.status === 0 && r.stdout) return r.stdout.toString().trim()
  } catch { }
  try {
    return execSync(`which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

function print(...args: unknown[]) {
  console.log(...args)
}

async function runInstaller() {
  try {
    // prefer invoking the TS script via npx/tsx to ensure environment
    const runner = which('npx') ? 'npx' : which('tsx') ? 'tsx' : null
    if (runner) {
      const args = runner === 'npx' ? ['tsx', './src/utils/cli/idb/install-idb.ts'] : ['./src/utils/cli/idb/install-idb.ts']
      const res = spawnSync(runner, args, { stdio: 'inherit' })
      return typeof res.status === 'number' ? res.status === 0 : false
    }

    // fallback: attempt to import and run the installer directly (may rely on ts-node/tsx)
    try {
      // call the exported main; it returns a promise
      await installMain()
      return true
    } catch {
      return false
    }
  } catch (e) {
    console.error('Failed to run installer:', e instanceof Error ? e.message : String(e))
    return false
  }
}

try {
  print('PATH=', process.env.PATH)
  const idb = process.env.IDB_PATH || getIdbCmd()
  print('idb:', idb)
  if (idb && isIDBInstalled()) {
    const version = getIdbPackageVersion()
    if (version) print('fb-idb version:', version)
    try {
      const output = execSync(`${idb} list-targets --json`, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString().trim()
      print('idb list-targets --json: ok')
      if (output) print(output)
    } catch (e) {
      print('idb list-targets --json: (failed)', e instanceof Error ? e.message : String(e))
      process.exit(2)
    }
    const companion = which('idb_companion')
    print('which idb_companion:', companion)
    if (companion) try { print('idb_companion --version:', execSync('idb_companion --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) } catch (e) { print('idb_companion --version: (failed)', e instanceof Error ? e.message : String(e)) }
    process.exit(0)
  }

  print('idb not found or not responding')
  const auto = process.env.MCP_AUTO_INSTALL_IDB === 'true'
  if (auto) {
    print('MCP_AUTO_INSTALL_IDB=true, attempting installer...')
    const ok = await runInstaller()
    if (ok) process.exit(0)
    print('Installer failed or did not produce idb')
    process.exit(2)
  }

  print('Set MCP_AUTO_INSTALL_IDB=true to attempt automatic installation (CI-friendly).')
  process.exit(2)
} catch (e) {
  console.error('idb healthcheck failed:', e instanceof Error ? e.message : String(e))
  process.exit(2)
}
