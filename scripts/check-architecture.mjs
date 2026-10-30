import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gatherDependOnFileViolations, gatherCycleViolations, projectEdges, perEdge, perInternalEdge } from 'archunit'
import { architectureGraph } from './architecture-graph.mjs'

export const architectureRules = [
  {
    name: 'Shared contracts stay independent of application implementations',
    source: /^src\/contracts\//,
    forbidden: /^src\/(?!contracts\/)/
  },
  {
    name: 'Capabilities and shared modules cannot import the MCP server layer',
    source: /^src\/(?!server(?:\/|-core\.ts$|\.ts$))/,
    forbidden: /^src\/server(?:\/|-core\.ts$|\.ts$)/
  },
  {
    name: 'Pure interaction calculations cannot import native I/O or service facades',
    source: /^src\/interact\/(?:adjustment\/(?:adjustment-plan|control-values|control-geometry|slider-labels)|targeting\/(?:candidate-scoring|candidate-ancestor|candidate-result|nearby-control|element-helpers|resolved-elements|tap-target|target-scope)|waits\/(?:ui-change-helpers|ui-wait-condition)|assertions\/state-comparison)\.ts$/,
    forbidden: /^(?:node:(?:child_process|fs|net|http|https)(?:\/|$)|src\/(?:utils\/(?:android|ios)\/|(?:interact|observe|manage)\/(?:index|android|ios)\.ts$))/
  }
]
const filter = regExp => ({ regExp, options: { target: 'path', matching: 'partial' } })

export function checkArchitecture(graph) {
  const projected = projectEdges(graph, perEdge())
  const results = architectureRules.map(rule => ({
    name: rule.name,
    violations: gatherDependOnFileViolations(projected, [filter(rule.source)], [filter(rule.forbidden)], true)
  }))
  const runtime = graph.filter(edge => edge.importKinds.includes('value') || !edge.importKinds.includes('type'))
  results.push({ name: 'Production runtime dependencies must be cycle-free',
    violations: gatherCycleViolations(projectEdges(runtime, perInternalEdge()), []) })
  return results
}

async function main() {
  const graph = await architectureGraph(process.argv[2])
  const results = checkArchitecture(graph)
  const failures = results.filter(result => result.violations.length)
  for (const result of failures) console.error(`${result.name}\n${JSON.stringify(result.violations, null, 2)}`)
  if (failures.length) process.exitCode = 1
  else console.log(`Architecture: PASS (${results.length} rules; ${graph.filter(edge => edge.source !== edge.target).length} dependency edges, including type, dynamic and re-export dependencies)`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
