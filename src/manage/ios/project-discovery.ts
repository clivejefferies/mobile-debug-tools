import { promises as fs } from "fs"
import path from "path"
export async function findProject(root: string, maxDepth = 4): Promise<{ dir: string, workspace?: string, proj?: string } | null> {
  try {
    const ents = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      // .xcworkspace and .xcodeproj are directories on disk (bundles), not regular files
      if (e.name.endsWith('.xcworkspace')) return { dir: root, workspace: e.name }
      if (e.name.endsWith('.xcodeproj')) return { dir: root, proj: e.name }
    }
  } catch { }

  if (maxDepth <= 0) return null

  try {
    const ents = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      if (e.isDirectory()) {
        const candidate = await findProject(path.join(root, e.name), maxDepth - 1)
        if (candidate) return candidate
      }
    }
  } catch { }

  return null
}
