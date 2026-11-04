import { promises as fs } from 'node:fs'
import path from 'node:path'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { getXcrunCmd } from '../../utils/ios/utils.js'
import { traceCommand, spawnTrace, type TraceSpawn } from './process.js'
import type { IosApp } from './capabilities.js'

export const IOS_TRACE_MAX_BYTES = 256 * 1024 * 1024
export async function traceSize(root: string, secure = false): Promise<number> {
  const stat = await fs.lstat(root)
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('UNSAFE_ARTIFACT')
  if (secure) await fs.chmod(root, stat.isDirectory() ? 0o700 : 0o600)
  if (stat.isFile()) return stat.size
  let size = 0
  for (const name of await fs.readdir(root)) {
    size += await traceSize(path.join(root, name), secure)
    if (size > IOS_TRACE_MAX_BYTES) throw new Error('STORAGE_LIMIT')
  }
  return size
}
interface TocProcess { '@_pid'?: string; '@_path'?: string }
interface TocRun {
  processes?: { process?: TocProcess | TocProcess[] }
  info?: { target?: { device?: { '@_uuid'?: string }; process?: { '@_pid'?: string; '@_name'?: string } }; summary?: { 'template-name'?: string } }
  data?: { table?: { '@_schema'?: string }[] | { '@_schema'?: string } }
}
export function validateToc(xml: string, device: string, app: IosApp) {
  if (XMLValidator.validate(xml) !== true) throw new Error('INVALID_TOC')
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as { 'trace-toc'?: { run?: TocRun | TocRun[] } }
  const raw = parsed['trace-toc']?.run
  if (!raw || Array.isArray(raw)) throw new Error('INVALID_TOC')
  const target = raw.info?.target
  if (target?.device?.['@_uuid'] !== device || Number(target.process?.['@_pid']) !== app.pid || raw.info?.summary?.['template-name'] !== 'Time Profiler') throw new Error('ARTIFACT_TARGET_MISMATCH')
  const processes = raw.processes?.process
  if (!(Array.isArray(processes) ? processes : [processes]).some(p => Number(p?.['@_pid']) === app.pid && p?.['@_path'] === app.executable)) throw new Error('ARTIFACT_APP_MISMATCH')
  const tables = raw.data?.table
  if (!(Array.isArray(tables) ? tables : [tables]).some(t => t?.['@_schema'] === 'time-sample')) throw new Error('SAMPLE_SCHEMA_MISSING')
}
export async function validateArtifact(file: string, device: string, app: IosApp, spawn: TraceSpawn = spawnTrace) {
  const size = await traceSize(file, true)
  if (size <= 0 || size > IOS_TRACE_MAX_BYTES) throw new Error('STORAGE_LIMIT')
  const toc = path.join(path.dirname(file), 'toc.xml'), samples = path.join(path.dirname(file), 'samples.xml')
  try {
    await traceCommand(getXcrunCmd(), ['xctrace', 'export', '--input', file, '--toc', '--output', toc], 15000, spawn)
    if ((await fs.stat(toc)).size > 1024 * 1024) throw new Error('INVALID_TOC')
    validateToc(await fs.readFile(toc, 'utf8'), device, app)
    await traceCommand(getXcrunCmd(), ['xctrace', 'export', '--input', file, '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="time-sample"]', '--output', samples], 15000, spawn)
    if ((await fs.stat(samples)).size > IOS_TRACE_MAX_BYTES) throw new Error('STORAGE_LIMIT')
    const xml = await fs.readFile(samples, 'utf8')
    if (XMLValidator.validate(xml) !== true || !xml.includes('<trace-query-result>')) throw new Error('INVALID_SAMPLES')
    const sample_rows = (xml.match(/<row(?:\s|>)/g) ?? []).length
    return { path: file, format: 'instruments' as const, kind: (await fs.stat(file)).isDirectory() ? 'directory' as const : 'file' as const,
      size_bytes: size, validation: { readable: true, schema: 'time-sample', sample_rows } }
  } finally { await Promise.all([toc, samples].map(p => fs.rm(p, { force: true }))) }
}
