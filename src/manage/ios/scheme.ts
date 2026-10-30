import { spawnSync } from "child_process"
export async function detectScheme(projectRootDir: string, xcodeCmdInner: string, workspacePath?: string, projectPathFull?: string, cwd?: string): Promise<string | null> {
  try {
    const args = workspacePath ? ['-list', '-workspace', workspacePath] : ['-list', '-project', projectPathFull!]
    // Run xcodebuild directly to list schemes
    const res = spawnSync(xcodeCmdInner, args, { cwd: cwd || projectRootDir, encoding: 'utf8', timeout: 20000 })
    const out = res.stdout || ''
    const schemesMatch = out.match(/Schemes:\s*\n([\s\S]*?)(?:\n\n|$)/m)
    if (schemesMatch) {
      const block = schemesMatch[1]
      const schemes = block.split(/\n/).map(s => s.trim()).filter(Boolean)
      if (schemes.length) return schemes[0]
    }
  } catch { }
  return null
}
