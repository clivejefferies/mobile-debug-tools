import type { LogFilters } from '../logs/model.js'
import type { StructuredLogEntry } from '../../types.js'
import { GetLogsResponse } from "../../types.js"
import { getIOSDeviceMetadata, validateBundleId } from "../../utils/ios/utils.js"
import { iosExecCommand } from './context.js'
export async function collectGetLogs(filters: { appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number } = {}): Promise<GetLogsResponse> {
  const { appId, deviceId = 'booted', pid, tag, level, contains, since_seconds, limit } = filters
  const effectiveLimit = typeof limit === 'number' && limit > 0 ? limit : 50
  const { args, processNameUsed } = logArguments(filters, deviceId)
  try {
    const detectedPid = await detectLogPid(appId, pid, deviceId)
    const effectivePid = pid || detectedPid || null
    const result = await iosExecCommand(args, deviceId)
    const device = await getIOSDeviceMetadata(deviceId)
    const rawLines = result.output ? result.output.split(/\r?\n/).filter(Boolean) : []

    // Parse lines into structured entries. iOS log format: timestamp [PID:tid] <level> subsystem:category: message
    const parsed = rawLines.map(line => parseIOSLog(line))

    const filtered = filterLogs(parsed, filters, effectivePid, processNameUsed)
    // Order oldest -> newest
    filtered.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return ta - tb
    })

    const source = effectivePid ? 'pid' : (appId ? 'process' : 'broad')
    const meta = { appIdProvided: !!appId, processNameUsed: processNameUsed || null, detectedPid: detectedPid || null, filters: { tag, level, contains, since_seconds, limit: effectiveLimit }, pidExplicit: !!pid }
    const limited = filtered.slice(-Math.max(0, effectiveLimit))
    return { device, logs: limited, logCount: limited.length, source, meta }
  } catch (err) {
    console.error('iOS getLogs failed:', err)
    const device = await getIOSDeviceMetadata(deviceId)
    return { device, logs: [], logCount: 0, source: 'broad', meta: { error: err instanceof Error ? err.message : String(err) } }
  }
}

function parseIOSLog(line: string): StructuredLogEntry {
  // Example: 2023-08-12 12:34:56.789012+0000  pid  <Debug>  MyApp[123:456]  <info>  MySubsystem: MyCategory: Message here
  // Simpler approach: try to extract ISO timestamp at start
  let ts: string | null = null
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)/)
  if (tsMatch) {
    const d = new Date(tsMatch[1])
    if (!isNaN(d.getTime())) ts = d.toISOString()
  }

  // level mapping
  let lvl = 'INFO'
  const lvlMatch = line.match(/\b(Debug|Info|Default|Error|Fault|Warning)\b/i)
  if (lvlMatch) {
    const map: Record<string, string> = { 'debug': 'DEBUG', 'info': 'INFO', 'default': 'DEBUG', 'error': 'ERROR', 'fault': 'ERROR', 'warning': 'WARN' }
    lvl = map[(lvlMatch[1] || '').toLowerCase()] || 'INFO'
  }

  // subsystem/category -> tag
  let tagVal = ''
  const tagMatch = line.match(/\s([A-Za-z0-9_./-]+):\s/)
  if (tagMatch) tagVal = tagMatch[1]

  // pid extraction
  let pidNum: number | null = null
  const pidMatch = line.match(/\[(\d+):\d+\]/)
  if (pidMatch) pidNum = Number(pidMatch[1])

  // message: extract robustly after the subsystem/category token when available
  let message = line
  if (tagMatch) {
    // tagMatch[0] includes the delimiter (e.g. " MySubsystem: ") — use it to find the message start
    const marker = tagMatch[0]
    const idx = line.indexOf(marker)
    if (idx !== -1) {
      message = line.slice(idx + marker.length).trim()
    } else {
      // fallback: try to trim off common prefixes (timestamp, pid, level) and keep the rest
      const afterPidMatch = line.match(/\]\s+/)
      if (afterPidMatch) {
        const afterPidIdx = line.indexOf(afterPidMatch[0]) + afterPidMatch[0].length
        message = line.slice(afterPidIdx).trim()
      } else {
        // remove leading level tokens like <Debug> and keep remainder
        message = line.replace(/^.*?<.*?>\s*/, '').trim()
      }
    }
  } else {
    // No tag found — strip obvious prefixes and keep remainder (preserve colons in message)
    message = line.replace(/^.*?<.*?>\s*/, '').trim()
  }

  return { timestamp: ts, level: lvl, tag: tagVal, pid: pidNum, message }
}

function logArguments(filters: LogFilters, deviceId: string) {
  const { appId, tag, since_seconds } = filters
  const args: string[] = ['simctl', 'spawn', deviceId, 'log', 'show', '--style', 'syslog']

  // Default to last N seconds if no since_seconds provided; limit lines handled after parsing

  if (since_seconds) {
    // log show accepts --last <time>
    args.push('--last', `${since_seconds}s`)
  } else {
    // default to last 60s to keep quick
    args.push('--last', '60s')
  }

  let processNameUsed: string | undefined = undefined
  if (appId) {
    validateBundleId(appId)
    // prefer matching the simple process name (last segment of bundle id), but also match full bundle id in subsystem
    const parts = appId.split('.')
    const simpleName = parts[parts.length - 1]
    processNameUsed = simpleName
    // predicate: match process by simple name or full bundle id, or subsystem contains bundle id
    args.push('--predicate', `process == "${simpleName}" or process == "${appId}" or subsystem contains "${appId}"`)
  } else if (tag) {
    // predicate by subsystem/category
    args.push('--predicate', `subsystem contains "${tag}"`)
  }

  return { args, processNameUsed }
}

async function detectLogPid(appId: string | undefined, pid: number | undefined, deviceId: string) {
  // Attempt pid detection if appId provided and no explicit pid supplied — prefer process name derived from bundle id
  let detectedPid: number | null = null
  if (appId && !pid) {
    const parts = appId.split('.')
    const simpleName = parts[parts.length - 1]
    try {
      const pgrepRes = await iosExecCommand(['simctl', 'spawn', deviceId, 'pgrep', '-f', simpleName], deviceId)
      const out = pgrepRes && pgrepRes.output ? pgrepRes.output.trim() : ''
      const firstLine = out.split(/\r?\n/).find(Boolean)
      if (firstLine) {
        const n = Number(firstLine.trim())
        if (!isNaN(n) && n > 0) detectedPid = n
      }
    } catch {
      // ignore pgrep failures — we'll fall back to process/bundle matching
    }
  }

  return detectedPid
}

function filterLogs(parsed: StructuredLogEntry[], filters: LogFilters, effectivePid: number | null, processNameUsed: string | undefined) {
  const { contains, since_seconds, level, tag, appId } = filters
  // Apply contains filter
  let filtered = parsed
  if (contains) filtered = filtered.filter(e => e.message && e.message.includes(contains))

  // Apply since_seconds already applied by log show, but double-check timestamps
  if (since_seconds) {
    const sinceMs = Date.now() - (since_seconds * 1000)
    filtered = filtered.filter(e => e.timestamp && (new Date(e.timestamp).getTime() >= sinceMs))
  }

  // level filter
  if (level) {
    const L = level.toUpperCase()
    filtered = filtered.filter(e => e.level && e.level.toUpperCase() === L)
  }

  // tag filter
  if (tag) filtered = filtered.filter(e => e.tag && e.tag.includes(tag))

  // pid filter (use detected/effective pid if available)
  const pidToFilter = effectivePid
  if (pidToFilter) filtered = filtered.filter(e => e.pid === pidToFilter)

  // If appId present but no predicate returned lines, try substring match
  if (appId && filtered.length === 0) {
    const matched = parsed.filter(e => (e.message && e.message.includes(appId)) || (e.tag && e.tag.includes(appId)) || (e.message && processNameUsed && e.message.includes(processNameUsed)))
    if (matched.length > 0) filtered = matched
  }

  return filtered
}
