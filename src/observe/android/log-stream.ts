import type { StreamLogEntry } from '../logs/model.js'
import { spawn } from "child_process"
import { getAdbCmd, execAdb, parseLogLine } from "../../utils/android/utils.js"
import { createWriteStream } from "fs"
import { promises as fsPromises } from "fs"
import path from "path"
import { activeLogStreams } from './context.js'
export async function startLogStream(packageName: string, level: 'error' | 'warn' | 'info' | 'debug' = 'error', deviceId?: string, sessionId: string = 'default') {
  try {
    const pidOutput = await execAdb(['shell', 'pidof', packageName], deviceId).catch(() => '')
    const pid = (pidOutput || '').trim()
    if (!pid) return { success: false, error: 'app_not_running' }

    const levelMap: Record<string, string> = { error: '*:E', warn: '*:W', info: '*:I', debug: '*:D' }
    const filter = levelMap[level] || levelMap['error']

    if (activeLogStreams.has(sessionId)) {
      try { activeLogStreams.get(sessionId)!.proc.kill() } catch { }
      activeLogStreams.delete(sessionId)
    }

    const args = [...(deviceId ? ['-s', deviceId] : []), 'logcat', `--pid=${pid}`, filter]
    const proc = spawn(getAdbCmd(), args)

    const tmpDir = process.env.TMPDIR || '/tmp'
    const file = path.join(tmpDir, `mobile-debug-log-${sessionId}.ndjson`)
    const stream = createWriteStream(file, { flags: 'a' })

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const lines = text.split(/\r?\n/).filter(Boolean)
      for (const l of lines) {
        const entry = parseLogLine(l)
        stream.write(JSON.stringify(entry) + '\n')
      }
    })

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      const lines = text.split(/\r?\n/).filter(Boolean)
      for (const l of lines) {
        const entry = { timestamp: '', level: 'E', tag: 'adb', message: l }
        stream.write(JSON.stringify(entry) + '\n')
      }
    })

    proc.on('close', () => {
      stream.end()
      if (activeLogStreams.get(sessionId)?.proc === proc) activeLogStreams.delete(sessionId)
    })

    activeLogStreams.set(sessionId, { proc, file, device: { platform: 'android', id: deviceId ?? '' } })
    return { success: true, stream_started: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function stopLogStream(sessionId: string = 'default') {
  const entry = activeLogStreams.get(sessionId)
  if (!entry) return { success: true }
  try { entry.proc.kill() } catch { }
  activeLogStreams.delete(sessionId)
  return { success: true }
}

export async function collectReadLogStream(sessionId: string = 'default', limit: number = 100, since?: string) {
  const entry = activeLogStreams.get(sessionId)
  let file: string | undefined
  if (entry && entry.file) file = entry.file
  else {
    const tmpDir = process.env.TMPDIR || '/tmp'
    const candidate = path.join(tmpDir, `mobile-debug-log-${sessionId}.ndjson`)
    file = candidate
  }

  try {
    const data = await fsPromises.readFile(file, 'utf8').catch(() => '')
    if (!data) return { entries: [], crash_summary: { crash_detected: false } }
    const lines = data.split(/\r?\n/).filter(Boolean)

    const parsed = lines.map(l => {
      try {
        const obj = JSON.parse(l) as StreamLogEntry
        if (typeof obj._iso === 'undefined') {
          let iso: string | null = null
          if (obj.timestamp) {
            const d = new Date(obj.timestamp)
            if (!isNaN(d.getTime())) iso = d.toISOString()
          }
          obj._iso = iso
        }
        if (typeof obj.crash === 'undefined') {
          const msg = (obj.message || '').toString()
          const exMatch = msg.match(/\b([A-Za-z0-9_$.]+Exception)\b/)
          if (/FATAL EXCEPTION/i.test(msg) || exMatch) {
            obj.crash = true
            if (exMatch) obj.exception = exMatch[1]
          } else {
            obj.crash = false
          }
        }
        return obj
      } catch {
        return { message: l, _iso: null, crash: false }
      }
    })

    let filtered = parsed
    if (since) {
      let sinceMs: number | null = null
      if (/^\d+$/.test(since)) sinceMs = Number(since)
      else {
        const sDate = new Date(since)
        if (!isNaN(sDate.getTime())) sinceMs = sDate.getTime()
      }
      if (sinceMs !== null) filtered = parsed.filter(p => p._iso && (new Date(p._iso).getTime() >= sinceMs))
    }

    const entries = filtered.slice(-Math.max(0, limit))
    const crashEntry = entries.find(e => e.crash)
    const crash_summary = crashEntry ? { crash_detected: true, exception: crashEntry.exception, sample: crashEntry.message } : { crash_detected: false }
    return { entries, crash_summary }
  } catch {
    return { entries: [], crash_summary: { crash_detected: false } }
  }
}
