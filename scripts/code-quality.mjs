import { ESLint } from 'eslint'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { parse } from '@typescript-eslint/parser'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const limits = Object.freeze({ 'max-lines': 500, 'class-lines': 300,
  'max-lines-per-function': 80, complexity: 20, 'max-depth': 4, 'explicit-any': 0 })
const functionKinds = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const measuredRules = new Set(['max-lines', 'max-lines-per-function', 'complexity', 'max-depth'])

function children(node) {
  return Object.entries(node).filter(([key]) => !['parent', 'tokens', 'comments', 'loc', 'range'].includes(key))
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .filter(value => value && typeof value === 'object' && typeof value.type === 'string')
}
function label(node, parent) {
  if (node.id?.name) return node.id.name
  if (parent?.type === 'MethodDefinition' || parent?.type === 'Property' || parent?.type === 'PropertyDefinition') {
    const name = parent.key.name ?? parent.key.value ?? '[computed]'
    return ['get', 'set'].includes(parent.kind) ? `${parent.kind}:${name}` : name
  }
  if (parent?.type === 'VariableDeclarator') return parent.id.name ?? '[destructured]'
  if (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') {
    const callee = parent.callee.name ?? parent.callee.property?.name ?? '[call]'
    return `${callee}:argument${parent.arguments.indexOf(node)}`
  }
  return `[${node.type}]`
}
function syntax(code) {
  const ast = parse(code, { loc: true, range: true, comment: true, sourceType: 'module', ecmaVersion: 'latest' })
  const symbols = [], anys = [], imports = []
  function visit(node, parent, scope = '<module>') {
    if (['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(node.type)) scope = `${scope}/${node.id.name}`
    if (functionKinds.has(node.type) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const anonymous = !node.id?.name && !['MethodDefinition', 'Property', 'PropertyDefinition', 'VariableDeclarator'].includes(parent?.type)
      const suffix = anonymous ? ':' + createHash('sha256').update(code.slice(...node.range).replace(/\s/g, '')).digest('hex').slice(0, 12) : ''
      scope = `${scope}/${label(node, parent)}${suffix}`
      symbols.push({ node, identity: scope })
    }
    if (node.type === 'TSAnyKeyword') anys.push({ node, identity: scope })
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression', 'TSImportType'].includes(node.type) && node.source) {
      imports.push({ node, value: node.source.value })
    }
    if (node.type === 'CallExpression' && node.callee.name === 'require' && node.arguments[0]?.type === 'Literal') {
      imports.push({ node, value: node.arguments[0].value })
    }
    for (const child of children(node)) visit(child, node, scope)
  }
  visit(ast, null)
  return { ast, symbols, anys, imports }
}
function lineCount(code, comments, start = 0, end = code.length) {
  const chars = code.split('')
  for (const c of comments) for (let i = c.range[0]; i < c.range[1]; i++) if (chars[i] !== '\n') chars[i] = ' '
  return chars.slice(start, end).join('').split('\n').filter(line => line.trim()).length
}
const eslint = new ESLint({ overrideConfig: [{ files: ['**/*.ts'], linterOptions: { noInlineConfig: true }, rules: {
  'max-lines': ['error', { max: limits['max-lines'], skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: limits['max-lines-per-function'], skipBlankLines: true, skipComments: true }],
  complexity: ['error', { max: limits.complexity, variant: 'classic' }], 'max-depth': ['error', limits['max-depth']]
} }] })

export async function measure(file, code) {
  if (file.endsWith('.java')) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code)
    const comments = []
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if ([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token)) {
        comments.push({ range: [scanner.getTokenPos(), scanner.getTextPos()] })
      }
    }
    const value = lineCount(code, comments)
    return value > limits['max-lines'] ? [{ file, rule: 'max-lines', symbol: '<module>', value, line: 1 }] : []
  }
  const { ast, symbols, anys, imports } = syntax(code)
  const findings = []
  const add = (rule, symbol, value, line) => findings.push({ file, rule, symbol, value, line })
  const identities = new Set()
  for (const { node, identity } of symbols) {
    if (identities.has(identity) && !identity.includes(':argument')) add('duplicate-symbol', identity, 1, node.loc.start.line)
    identities.add(identity)
    if (node.type.startsWith('Class')) {
      const value = lineCount(code, ast.comments, ...node.range)
      if (value > limits['class-lines']) add('class-lines', identity, value, node.loc.start.line)
    }
  }
  const anyCounts = new Map()
  for (const { node, identity } of anys) {
    const current = anyCounts.get(identity) ?? { value: 0, line: node.loc.start.line }
    current.value++; anyCounts.set(identity, current)
  }
  for (const [identity, { value, line }] of anyCounts) add('explicit-any', identity, value, line)
  const [result] = await eslint.lintText(code, { filePath: file })
  for (const m of result.messages.filter(m => measuredRules.has(m.ruleId))) {
    const value = Number(/(?:has too many lines \(|complexity of |nested too deeply \()([\d]+)/.exec(m.message)?.[1])
    if (!Number.isFinite(value)) throw new Error(`Cannot read ${m.ruleId} metric: ${m.message}`)
    const candidates = symbols.filter(({ node }) => m.line >= node.loc.start.line && m.line <= node.loc.end.line)
      .sort((a, b) => a.node.range[1] - a.node.range[0] - (b.node.range[1] - b.node.range[0]))
    const symbol = m.ruleId === 'max-lines' ? '<module>' : candidates[0]?.identity ?? '<module>'
    add(m.ruleId, symbol, value, m.line)
  }
  for (const comment of ast.comments) {
    if (/(?:eslint-(?:disable|enable)|^\s*eslint\s)/.test(comment.value) &&
      (!/eslint-(?:disable|enable)(?:-next-line|-line)?\s+(?!-)[\w@]/.test(comment.value) ||
      /max-lines|complexity|max-depth|no-explicit-any|code-quality/.test(comment.value))) {
      add('inline-suppression', '<module>', 1, comment.loc.start.line)
    }
  }
  if (file.startsWith('src/interact/') || file.startsWith('src/runtime/')) {
    for (const { node, value } of imports) if (typeof value === 'string' && /(?:^|\/)server(?:\/|-core)/.test(value)) {
      add('import-boundary', '<module>', 1, node.loc.start.line)
    }
  }
  // Multiple nested blocks can report depth in the same function; retain its maximum.
  return [...findings.reduce((out, f) => {
    const key = `${f.rule}:${f.symbol}`
    if (!out.has(key) || out.get(key).value < f.value) out.set(key, f)
    return out
  }, new Map()).values()]
}
export function compare(findings, baseline) {
  const errors = [], entries = new Map()
  const key = f => JSON.stringify([f.file, f.rule, f.symbol])
  for (const b of baseline) {
    if (!b.file || !b.rule || !b.symbol || !b.reason || !Number.isInteger(b.value) || b.value < 1) {
      errors.push('Invalid baseline entry'); continue
    }
    if (entries.has(key(b))) errors.push(`Duplicate baseline entry: ${key(b)}`)
    entries.set(key(b), b)
  }
  for (const f of findings) {
    const b = entries.get(key(f))
    if (['duplicate-symbol', 'inline-suppression', 'import-boundary'].includes(f.rule) || !b || f.value > b.value) {
      errors.push(`${f.file}:${f.line}: ${f.rule} ${f.symbol} = ${f.value}; allowed ${b?.value ?? limits[f.rule] ?? 0}`)
    } else if (f.value < b.value) errors.push(`Lower baseline ceiling for ${key(f)}: ${b.value} -> ${f.value}`)
    entries.delete(key(f))
  }
  for (const b of entries.values()) errors.push(`Remove obsolete baseline entry: ${key(b)}`)
  return errors
}
export async function collect(root = 'src') {
  const out = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.posix.join(root, entry.name)
    if (entry.isDirectory()) out.push(...await collect(file))
    else if (/\.(ts|java)$/.test(file)) out.push(...await measure(file, await readFile(file, 'utf8')))
  }
  return out
}
async function main() {
  const baseline = JSON.parse(await readFile(new URL('./code-quality-baseline.json', import.meta.url), 'utf8'))
  const errors = compare(await collect(), baseline)
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log('Code quality: PASS (size, complexity, nesting, types, boundaries and legacy ceilings)')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
