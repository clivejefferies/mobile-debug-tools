import type { StreamLogEntry } from '../logs/model.js'
import { captureEvidence } from '../evidence.js'
import { spawn } from "child_process"
import { getXcrunCmd } from "../../utils/ios/utils.js"
import { createWriteStream, promises as fsPromises } from 'fs'
import path from 'path'
import { parseLogLine } from '../../utils/android/utils.js'
import { iosActiveLogStreams } from './context.js'
export async function startLogStream(bundleId: string, deviceId: string = 'booted', sessionId: string = 'default'): Promise<{ success: boolean; stream_started?: boolean; error?: string }> {
  try {
    const simple = bundleId.split('.').pop() || bundleId
    const predicate = `process == "${simple}" or process == "${bundleId}" or subsystem contains "${bundleId}"`

    if (iosActiveLogStreams.has(sessionId)) {
      try { iosActiveLogStreams.get(sessionId)!.proc.kill() } catch { }
      iosActiveLogStreams.delete(sessionId)
    }

    const args = ['simctl', 'spawn', deviceId, 'log', 'stream', '--style', 'syslog', '--predicate', predicate]
    const proc = spawn(getXcrunCmd(), args)

    const tmpDir = process.env.TMPDIR || '/tmp'
    const file = path.join(tmpDir, `mobile-debug-ios-log-${sessionId}.ndjson`)
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
        const entry = { timestamp: '', level: 'E', tag: 'xcrun', message: l }
        stream.write(JSON.stringify(entry) + '\n')
      }
    })

    proc.on('close', () => {
      stream.end()
      if (iosActiveLogStreams.get(sessionId)?.proc === proc) iosActiveLogStreams.delete(sessionId)
    })

    iosActiveLogStreams.set(sessionId, { proc, file, device: { platform: 'ios', id: deviceId ?? '' } })
    return { success: true, stream_started: true }
  } catch {
    return { success: false, error: 'log_stream_start_failed' }
  }
}

export async function stopLogStream(sessionId: string = 'default'): Promise<{ success: boolean }> {
  const entry = iosActiveLogStreams.get(sessionId)
  if (!entry) return { success: true }
  try { entry.proc.kill() } catch { }
  iosActiveLogStreams.delete(sessionId)
  return { success: true }
}

export async function readLogStream(sessionId: string = 'default', limit: number = 100, since?: string): Promise<{ entries: StreamLogEntry[], crash_summary?: { crash_detected: boolean, exception?: string, sample?: string } }> {
  return captureEvidence('logs', iosActiveLogStreams.get(sessionId)?.device ?? null, () => collectReadLogStream(sessionId, limit, since))
}

export async function collectReadLogStream(sessionId: string = 'default', limit: number = 100, since?: string): Promise<{ entries: StreamLogEntry[], crash_summary?: { crash_detected: boolean, exception?: string, sample?: string } }> {
  const entry = iosActiveLogStreams.get(sessionId)
  if (!entry) return { entries: [] }
  try {
    const data = await fsPromises.readFile(entry.file, 'utf8').catch(() => '')
    if (!data) return { entries: [], crash_summary: { crash_detected: false } }
    const lines = data.split(/\r?\n/).filter(Boolean)
    const parsed = lines.map(l => {
      try {
        return JSON.parse(l) as StreamLogEntry
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
      if (sinceMs !== null) {
        filtered = parsed.filter(p => p._iso && (new Date(p._iso).getTime() >= sinceMs))
      }
    }

    const entries = filtered.slice(-Math.max(0, limit))
    const crashEntry = entries.find(e => e.crash)
    const crash_summary = crashEntry ? { crash_detected: true, exception: crashEntry.exception, sample: crashEntry.message } : { crash_detected: false }
    return { entries, crash_summary }
  } catch {
    return { entries: [], crash_summary: { crash_detected: false } }
  }
}
