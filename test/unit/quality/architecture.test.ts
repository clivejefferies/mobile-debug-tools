import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { architectureGraph } from '../../../scripts/architecture-graph.mjs'
import { checkArchitecture } from '../../../scripts/check-architecture.mjs'

const root = await mkdtemp(path.join(tmpdir(), 'mcp-architecture-'))
try {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ type: 'module' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: {
      module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022',
      paths: { '@server/*': ['./src/server/*'] }
    }, include: ['src/**/*.ts'] }),
    'src/server/entry.ts': 'export const value = 1',
    'src/contracts/bad.ts': "export { value } from '@server/entry.js'",
    'src/interact/entry.ts': "export const load = () => import('../server/entry.js')",
    'src/interact/adjustment/control-values.ts': "import { spawn } from 'node:child_process'; export const native = spawn",
    'src/cycle/a.ts': "export { b } from './b.js'; export const a = 1",
    'src/cycle/b.ts': "export const b = () => import('./a.js')",
    'src/type-cycle/a.ts': "import type { B } from './b.js'; export interface A { b: B }",
    'src/type-cycle/b.ts': "import { type A } from './a.js'; export interface B { a: A }",
    'src/import-equals.ts': "import entry = require('./server/entry.js'); export { entry }",
    'src/require.ts': "export const load = () => require('./server/entry.js')"
  }
  for (const [file, code] of Object.entries(files)) {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, code)
  }
  const config = path.join(root, 'tsconfig.json')
  const graph = await architectureGraph(config)
  const edge = (source: string, target: string) => graph.find(item => item.source === source && item.target === target)
  assert(edge('src/contracts/bad.ts', 'src/server/entry.ts'), 'Resolve aliased re-exports to .ts sources')
  assert(edge('src/interact/entry.ts', 'src/server/entry.ts'), 'Resolve literal dynamic .js imports')
  assert(edge('src/require.ts', 'src/server/entry.ts'), 'Resolve literal require calls')
  assert(edge('src/interact/adjustment/control-values.ts', 'node:child_process'), 'Include Node builtins')
  assert.deepEqual(edge('src/type-cycle/b.ts', 'src/type-cycle/a.ts')?.importKinds, ['type'])
  assert(edge('src/import-equals.ts', 'src/server/entry.ts'), 'Resolve import-equals require syntax')
  const rejected = spawnSync(process.execPath, ['scripts/check-architecture.mjs', config], { encoding: 'utf8' })
  assert.equal(rejected.status, 1, rejected.stderr)
  assert(rejected.stderr.includes('Production runtime dependencies must be cycle-free'))
  const results = checkArchitecture(graph)
  assert(results.every(result => result.violations.length > 0), 'Every rule must reject its deliberately broken fixture')
  const cycles = JSON.stringify(results.at(-1)?.violations)
  assert(cycles.includes('src/cycle/a.ts'), 'Catch a cycle through a re-export and dynamic import')
  assert(!cycles.includes('src/type-cycle'), 'Type-only cycles are not runtime cycles')
  assert(checkArchitecture([]).every(result => result.violations.length > 0), 'An empty graph must fail closed')

  await writeFile(path.join(root, 'src/nonliteral.ts'), 'export const load = (name: string) => import(name)')
  await assert.rejects(architectureGraph(config), /Nonliteral dependency/)
  await rm(path.join(root, 'src/nonliteral.ts'))
  await writeFile(path.join(root, 'src/unresolved.ts'), "import './missing.js'")
  await assert.rejects(architectureGraph(config), /Unresolved dependency/)
  console.log('PASS architecture negative controls: NodeNext, aliases, re-exports, dynamic/require imports, pure boundaries, runtime cycles, type-only cycles, empty and unresolved graphs')
} finally {
  await rm(root, { recursive: true, force: true })
}
