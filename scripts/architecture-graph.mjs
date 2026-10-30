import ts from 'typescript'
import path from 'node:path'
import { isBuiltin } from 'node:module'
import { extractGraph } from 'archunit'

// ArchUnitTS 2.5.4 extracts static imports. Add re-exports, import types and
// literal dynamic imports using the same project's TypeScript resolution.
export async function architectureGraph(configFile = 'tsconfig.json') {
  const configPath = path.resolve(configFile)
  const root = path.dirname(configPath)
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n'
  }))
  const graph = await extractGraph(configPath, { clearCache: true })
  const local = file => path.relative(root, file).split(path.sep).join('/')
  const edges = new Map(graph.map(edge => [JSON.stringify([edge.source, edge.target]), edge]))
  const recorded = new Set()
  for (const file of parsed.fileNames) {
    const code = ts.sys.readFile(file)
    if (code === undefined) throw new Error(`Cannot read architecture source: ${file}`)
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
    const source = local(file)
    function add(specifier, typeOnly = false) {
      const module = specifier.text
      const resolved = ts.resolveModuleName(module, file, parsed.options, ts.sys).resolvedModule
      if (!resolved && !isBuiltin(module)) throw new Error(`Unresolved dependency: ${source} -> ${module}`)
      const external = !resolved || !!resolved.isExternalLibraryImport
      const target = resolved ? local(resolved.resolvedFileName) : module.replace(/^(?!node:)/, 'node:')
      const key = JSON.stringify([source, target])
      const kind = typeOnly ? 'type' : 'value'
      const previous = edges.get(key)
      // Replace the initial static classification, then union repeated dependencies.
      if (previous && recorded.has(key)) {
        previous.importKinds = [...new Set([...previous.importKinds, kind])]
      } else edges.set(key, { source, target, external, importKinds: [kind] })
      recorded.add(key)
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        const bindings = clause?.namedBindings
        const typeOnly = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly))
        add(node.moduleSpecifier, !!typeOnly)
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const bindings = node.exportClause
        const typeOnly = node.isTypeOnly || (bindings && ts.isNamedExports(bindings) &&
          bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly))
        add(node.moduleSpecifier, !!typeOnly)
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        if (!node.moduleReference.expression) throw new Error(`Missing import target in ${source}`)
        add(node.moduleReference.expression, node.isTypeOnly)
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        add(node.argument.literal, true)
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        const argument = node.arguments[0]
        if (!argument || !ts.isStringLiteralLike(argument)) throw new Error(`Nonliteral dependency in ${source}; architecture cannot resolve it`)
        add(argument)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return [...edges.values()]
}
