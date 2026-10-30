import type { LogFilters } from '../logs/model.js'
import type { StructuredLogEntry } from '../../types.js'
import { GetLogsResponse } from "../../types.js"
import { execAdb, getAndroidDeviceMetadata, getDeviceInfo, parseLogLine } from "../../utils/android/utils.js"
export async function collectGetLogs(filters: { appId?: string, deviceId?: string, pid?: number, tag?: string, level?: string, contains?: string, since_seconds?: number, limit?: number } = {}): Promise<GetLogsResponse> {
  const { appId, deviceId, pid, tag, level, contains, since_seconds, limit } = filters
  const metadata = await getAndroidDeviceMetadata(appId || "", deviceId)
  const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

  try {
    const effectiveLimit = typeof limit === 'number' && limit > 0 ? limit : 50

    const { pidArg, args } = await logcatArguments(filters, effectiveLimit)
    const stdout = await execAdb(args, deviceId)
    const allLines = stdout ? stdout.split(/\r?\n/).filter(Boolean) : []

    // Parse lines into structured entries
    const parsed = allLines.map(line => parseAndroidLog(line, pidArg))

    // Apply client-side filters: contains, since_seconds
    let filtered = parsed
    if (contains) filtered = filtered.filter(e => e.message && e.message.includes(contains))

    if (since_seconds) {
      const sinceMs = Date.now() - (since_seconds * 1000)
      filtered = filtered.filter(e => {
        if (!e.timestamp) return false
        const t = new Date(e.timestamp).getTime()
        return t >= sinceMs
      })
    }

    // If appId provided and no pidArg, try to filter by appId substring in message/tag
    if (appId && !pidArg) {
      const matched = filtered.filter(e => (e.message && e.message.includes(appId)) || (e.tag && e.tag.includes(appId)))
      if (matched.length > 0) filtered = matched
    }

    // Ensure ordering oldest -> newest (by timestamp when available)
    filtered.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return ta - tb
    })

    const limited = filtered.slice(-Math.max(0, effectiveLimit))

    const source = pidArg ? 'pid' : (appId ? 'package' : 'broad')
    const meta = { pidArg, appIdProvided: !!appId, filters: { tag, level, contains, since_seconds, limit: effectiveLimit }, pidExplicit: !!pid }
    return { device: deviceInfo, logs: limited, logCount: limited.length, source, meta }
  } catch (e) {
    console.error("Error fetching logs:", e)
    return { device: deviceInfo, logs: [], logCount: 0, source: 'broad', meta: { error: e instanceof Error ? e.message : String(e) } }
  }
}

function parseAndroidLog(l: string, pidArg: string | null): StructuredLogEntry {
  const entry = parseLogLine(l)
  // normalize level
  const levelChar = (entry.level || '').toUpperCase()
  const levelMapChar: Record<string, string> = { 'V': 'VERBOSE', 'D': 'DEBUG', 'I': 'INFO', 'W': 'WARN', 'E': 'ERROR' }
  const normLevel = levelMapChar[levelChar] || (entry.level && String(entry.level).toUpperCase()) || 'INFO'
  const iso = entry._iso || (() => {
    const d = new Date(entry.timestamp || '')
    if (!isNaN(d.getTime())) return d.toISOString()
    return null
  })()
  let pidNum: number | null = null
  if (entry.pid) pidNum = Number(entry.pid)
  else if (pidArg) pidNum = Number(pidArg)
  const pidVal = (pidNum !== null && !isNaN(pidNum)) ? pidNum : null
  return { timestamp: iso, level: normLevel, tag: entry.tag || '', pid: pidVal, message: entry.message || '' }
}

async function logcatArguments(filters: LogFilters, effectiveLimit: number) {
  const { appId, deviceId, pid, tag, level } = filters
  // If appId provided, try to get pid to filter at source
  let pidArg: string | null = null
  if (appId) {
    try {
      const pidOut = await execAdb(['shell', 'pidof', appId], deviceId).catch(() => '')
      const pidTrim = (pidOut || '').trim()
      if (pidTrim) pidArg = pidTrim.split('\n')[0]
    } catch (err) {
      // Log a warning so failures to detect PID are visible during debugging
      try { console.warn(`getLogs: pid detection failed for appId=${appId}:`, err instanceof Error ? err.message : String(err)) } catch { }
    }
  }

  const args = ['logcat', '-d', '-v', 'threadtime']
  // Apply pid filter via --pid if available
  if (pidArg) args.push(`--pid=${pidArg}`)
  else if (pid) args.push(`--pid=${pid}`)

  // Apply tag/level filter if provided
  if (tag && level) {
    // Map verbose/debug/info/warn/error to single-letter levels
    const levelMap: Record<string, string> = { 'VERBOSE': 'V', 'DEBUG': 'D', 'INFO': 'I', 'WARN': 'W', 'ERROR': 'E' }
    const L = (levelMap[(level || '').toUpperCase()] || 'V')
    args.push(`${tag}:${L}`)
  } else {
    // Default: show all levels
    args.push('*:V')
  }

  // Use -t to limit lines (apply early)
  args.push('-t', effectiveLimit.toString())

  return { pidArg, args }
}
