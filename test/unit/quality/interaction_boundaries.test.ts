import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { measure } from '../../../scripts/code-quality.mjs'

// Refactored interaction services must meet defaults even if someone adds a legacy allowance.
const legacy = new Set(['android.ts', 'ios.ts', 'conditional-action.ts', 'classify.ts'])
async function sourceFiles(directory = ''): Promise<string[]> {
  const entries = await readdir(`src/interact/${directory}`, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    const relative = directory ? `${directory}/${entry.name}` : entry.name
    if (entry.isDirectory()) paths.push(...await sourceFiles(relative))
    else if (relative.endsWith('.ts') && !legacy.has(relative)) paths.push(relative)
  }
  return paths
}
const files = await sourceFiles()
const baseline = JSON.parse(await readFile('scripts/code-quality-baseline.json', 'utf8')) as Array<{ file: string }>
for (const file of files) {
  const path = `src/interact/${file}`
  assert.deepEqual(await measure(path, await readFile(path, 'utf8')), [], `${path} must meet default structural and typing limits`)
  assert(!baseline.some(entry => entry.file === path), `${path} cannot inherit legacy exceptions`)
}
console.log(`PASS default quality limits and no legacy exceptions across ${files.length} interaction modules`)
