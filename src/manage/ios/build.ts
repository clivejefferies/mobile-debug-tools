import { promises as fs } from "fs"
import { spawn } from "child_process"
import { getIOSDeviceMetadata, findAppBundle } from "../../utils/ios/utils.js"
import path from "path"
import type { IOSBuildOptions, BuildEnv } from './build-types.js'
import { findProject } from './project-discovery.js'
import { detectScheme } from './scheme.js'
export async function buildIOS(projectPath: string, optsOrVariant?: string | IOSBuildOptions) {

  // Support legacy variant string as second arg
  const opts: IOSBuildOptions = typeof optsOrVariant === 'string' ? {} : (optsOrVariant || {})
  const env = { ...process.env, ...(opts.env || {}) }

  try {
    // Look for an Xcode workspace or project at the provided path. If not present, scan subdirectories (limited depth)

    const project = await resolveBuildProject(projectPath, opts)
    if ('error' in project) return project
    const { projectRootDir } = project
    const command = await prepareBuild(projectPath, opts, env, project)
    const failure = await executeBuild(command, projectRootDir, env)
    if (failure) return failure
    // Try to locate built .app. First search project tree, then DerivedData if necessary
    const built = await findAppBundle(projectPath)
    if (built) return { artifactPath: built }

    // Fallback: search DerivedData for matching product
    const dd = path.join(process.env.HOME || '', 'Library', 'Developer', 'Xcode', 'DerivedData')
    try {
      const entries = await fs.readdir(dd).catch(() => [])
      for (const e of entries) {
        const candidate = path.join(dd, e)
        const found = await findAppBundle(candidate).catch(() => undefined)
        if (found) return { artifactPath: found }
      }
    } catch { }

    return { error: 'Could not find .app after build' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

}

async function resolveBuildProject(projectPath: string, opts: IOSBuildOptions): Promise<{ projectRootDir: string; workspace?: string; proj?: string } | { error: string }> {
  // Resolve projectPath to an absolute path to avoid cwd-relative resolution issues
  const absProjectPath = path.resolve(projectPath)

  // If caller supplied explicit workspace/project, prefer those and set projectRootDir accordingly
  let projectRootDir = absProjectPath
  let workspace: string | undefined = opts.workspace
  let proj: string | undefined = opts.project

  if (workspace) {
    // normalize workspace path and set root to its parent
    workspace = path.isAbsolute(workspace) ? workspace : path.join(absProjectPath, workspace)
    projectRootDir = path.dirname(workspace)
    workspace = path.basename(workspace)
  } else if (proj) {
    proj = path.isAbsolute(proj) ? proj : path.join(absProjectPath, proj)
    projectRootDir = path.dirname(proj)
    proj = path.basename(proj)
  } else {
    const projectInfo = await findProject(absProjectPath, 4)
    if (!projectInfo) return { error: 'No Xcode project or workspace found' }
    projectRootDir = projectInfo.dir || absProjectPath
    workspace = projectInfo.workspace
    proj = projectInfo.proj
  }

  return { projectRootDir, workspace, proj }
}

async function prepareBuild(projectPath: string, opts: IOSBuildOptions, env: BuildEnv, project: { projectRootDir: string; workspace?: string; proj?: string }) {
  const { projectRootDir, workspace, proj } = project
  const destinationUDID = await destination(opts, env)
  // Determine xcode command early so it can be used when detecting schemes
  const xcodeCmd = opts.xcodeCmd || env.XCODEBUILD_PATH || 'xcodebuild'

  // Determine available schemes by querying xcodebuild -list rather than guessing

  // Prepare build flags and paths (support incremental builds)
  let buildArgs: string[]
  let chosenScheme: string | null = opts.scheme || null

  // Derived data and result bundle (agent-configurable)
  const derivedDataPath = opts.derivedDataPath || env.MCP_DERIVED_DATA || path.join(projectRootDir, 'build', 'DerivedData')
  // Use unique result bundle path by default to avoid collisions
  const resultBundlePath = env.MCP_XCODE_RESULTBUNDLE_PATH || path.join(projectRootDir, 'build', 'xcresults', `ResultBundle-${Date.now()}-${Math.random().toString(36).slice(2)}.xcresult`)
  const xcodeJobs = typeof opts.buildJobs === 'number' ? opts.buildJobs : (parseInt(env.MCP_XCODE_JOBS || '', 10) || 4)
  const forceClean = typeof opts.forceClean === 'boolean' ? opts.forceClean : env.MCP_FORCE_CLEAN === '1'

  // ensure result dirs exist
  await fs.mkdir(path.dirname(resultBundlePath), { recursive: true }).catch(() => { })
  await fs.mkdir(derivedDataPath, { recursive: true }).catch(() => { })
  // remove any pre-existing result bundle path to avoid xcodebuild complaining
  await fs.rm(resultBundlePath, { recursive: true, force: true }).catch(() => { })

  if (workspace) {
    const workspacePath = path.join(projectRootDir, workspace)
    if (!chosenScheme) chosenScheme = await detectScheme(projectRootDir, xcodeCmd, workspacePath, undefined, projectRootDir)
    const scheme = chosenScheme || workspace.replace(/\.xcworkspace$/, '')
    buildArgs = ['-workspace', workspacePath, '-scheme', scheme, '-configuration', 'Debug', '-sdk', 'iphonesimulator', 'build']
  } else {
    const projectPathFull = path.join(projectRootDir, proj!)
    if (!chosenScheme) chosenScheme = await detectScheme(projectRootDir, xcodeCmd, undefined, projectPathFull, projectRootDir)
    const scheme = chosenScheme || proj!.replace(/\.xcodeproj$/, '')
    buildArgs = ['-project', projectPathFull, '-scheme', scheme, '-configuration', 'Debug', '-sdk', 'iphonesimulator', 'build']
  }

  // Insert clean if explicitly requested via env or opts
  if (forceClean) {
    const idx = buildArgs.indexOf('build')
    if (idx >= 0) buildArgs.splice(idx, 0, 'clean')
  }

  // If we have a destination UDID, add an explicit destination to avoid xcodebuild picking an ambiguous target
  if (destinationUDID) {
    buildArgs.push('-destination', `platform=iOS Simulator,id=${destinationUDID}`)
  }

  // Add derived data and result bundle for diagnostics and faster incremental builds
  buildArgs.push('-derivedDataPath', derivedDataPath)
  buildArgs.push('-resultBundlePath', resultBundlePath)
  // parallelisation and jobs
  buildArgs.push('-parallelizeTargets')
  buildArgs.push('-jobs', String(xcodeJobs))

  // Prepare results directory for backwards-compatible logs
  const resultsDir = path.join(projectPath, 'build-results')
  // Remove any stale results to avoid xcodebuild complaining about existing result bundles
  await fs.rm(resultsDir, { recursive: true, force: true }).catch(() => { })
  await fs.mkdir(resultsDir, { recursive: true }).catch(() => { })

  return { xcodeCmd, buildArgs, resultsDir }
}

async function runAttempt(xcodeCmd: string, buildArgs: string[], projectRootDir: string, env: BuildEnv, timeoutMs: number) {
  return new Promise<{ code: number | null, stdout: string, stderr: string, killedByWatchdog?: boolean }>((resolve) => {
    const proc = spawn(xcodeCmd, buildArgs, { cwd: projectRootDir, env })
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', d => stdout += d.toString())
    proc.stderr?.on('data', d => stderr += d.toString())

    let killed = false
    const to = setTimeout(() => {
      killed = true
      try { proc.kill('SIGKILL') } catch { }
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(to)
      resolve({ code, stdout, stderr, killedByWatchdog: killed })
    })
    proc.on('error', (err) => {
      clearTimeout(to)
      resolve({ code: null, stdout, stderr: String(err), killedByWatchdog: killed })
    })
  })
}

async function executeBuild(command: { xcodeCmd: string; buildArgs: string[]; resultsDir: string }, projectRootDir: string, env: BuildEnv) {
  const { xcodeCmd, buildArgs, resultsDir } = command
  const XCODEBUILD_TIMEOUT = parseInt(env.MCP_XCODEBUILD_TIMEOUT || '', 10) || 180000 // default 3 minutes
  const MAX_RETRIES = parseInt(env.MCP_XCODEBUILD_RETRIES || '', 10) || 1

  const tries = MAX_RETRIES + 1
  let lastStdout = ''
  let lastStderr = ''
  let lastErr: (Error & { code?: number | null; exitCode?: number | null; killedByWatchdog?: boolean }) | null = null

  for (let attempt = 1; attempt <= tries; attempt++) {
    // Run xcodebuild with a watchdog
    const res = await runAttempt(xcodeCmd, buildArgs, projectRootDir, env, XCODEBUILD_TIMEOUT)

    lastStdout = res.stdout
    lastStderr = res.stderr

    if (res.code === 0) {
      // success — clear any previous error and stop retrying
      lastErr = null
      break
    }

    // record the failure for reporting
    lastErr = new Error(res.stderr || `xcodebuild failed with code ${res.code}`)
      // Attach exit code and watchdog info so diagnostics can include them
      ; lastErr.code = res.code
      ; lastErr.exitCode = res.code
      ; lastErr.killedByWatchdog = !!res.killedByWatchdog

    // write logs for diagnostics (helpful whether killed or not)
    try {
      await fs.writeFile(path.join(resultsDir, `xcodebuild-${attempt}.stdout.log`), res.stdout).catch(() => { })
      await fs.writeFile(path.join(resultsDir, `xcodebuild-${attempt}.stderr.log`), res.stderr).catch(() => { })
    } catch { }

    // If killed by watchdog and there are remaining attempts, continue to retry
    if (res.killedByWatchdog && attempt < tries) {
      continue
    }

    // no more retries or not a watchdog kill — break to report lastErr
    if (attempt >= tries) break
  }

  if (lastErr) {
    // Include diagnostics and result bundle path when available; provide structured info useful for agents
    const invokedCommand = `${xcodeCmd} ${buildArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`
    const envSnapshot = { PATH: env.PATH }
    return { error: `xcodebuild failed: ${lastErr.message}. See build-results for logs.`, output: `stdout:\n${lastStdout}\nstderr:\n${lastStderr}`, diagnostics: { exitCode: lastErr.code || null, invokedCommand, cwd: projectRootDir, envSnapshot } }
  }

  return null
}

async function destination(opts: IOSBuildOptions, env: BuildEnv) {
  // Determine destination: prefer explicit option, then env var, otherwise use booted simulator UDID
  let destinationUDID = opts.destinationUDID || env.MCP_XCODE_DESTINATION_UDID || env.MCP_XCODE_DESTINATION || ''
  if (!destinationUDID) {
    try {
      const meta = await getIOSDeviceMetadata('booted')
      if (meta && meta.id) destinationUDID = meta.id
    } catch { }
  }

  return destinationUDID
}
