interface AndroidLogEntry {
  timestamp: string; level: string; tag: string; message: string; _iso: string | null
  crash: boolean; exception?: string; pid?: string; tid?: string
}
export function parseLogLine(line: string) {  // Collapse internal newlines so multiline stack traces are parseable as a single entry
  const rawLine = line
  const normalizedLine = rawLine.replace(/\r?\n/g, ' ')
  const entry: AndroidLogEntry = { timestamp: '', level: '', tag: '', message: rawLine, _iso: null, crash: false }

  const nowYear = new Date().getFullYear()

  const tryIso = (ts: string) => {
    if (!ts) return null
    // If it's already ISO
    if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) return ts
    // If format MM-DD HH:MM:SS(.sss)
    const m = ts.match(/^(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/)
    if (m) {
      const month = m[1]
      const day = m[2]
      const time = m[3]
      const candidate = `${nowYear}-${month}-${day}T${time}`
      const d = new Date(candidate)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    // If format YYYY-MM-DD HH:MM:SS(.sss)
    const m2 = ts.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/)
    if (m2) {
      const candidate = `${m2[1]}T${m2[2]}`
      const d = new Date(candidate)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    return null
  }

  // Patterns to try (ordered)
  const patterns: Array<{ re: RegExp, groups: string[] }> = [
    // MM-DD HH:MM:SS.mmm PID TID LEVEL/Tag: msg
    { re: /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d+)\s+(\d+)\s+([VDIWE])\/([^:]+):\s*(.*)$/, groups: ['ts', 'pid', 'tid', 'level', 'tag', 'msg'] },
    // MM-DD HH:MM:SS.mmm PID TID LEVEL Tag: msg  (space between level and tag)
    { re: /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d+)\s+(\d+)\s+([VDIWE])\s+([^:]+):\s*(.*)$/, groups: ['ts', 'pid', 'tid', 'level', 'tag', 'msg'] },
    // YYYY-MM-DD full date with PID TID LEVEL/Tag
    { re: /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d+)\s+(\d+)\s+([VDIWE])\/([^:]+):\s*(.*)$/, groups: ['ts', 'pid', 'tid', 'level', 'tag', 'msg'] },
    // YYYY-MM-DD with space separation
    { re: /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d+)\s+(\d+)\s+([VDIWE])\s+([^:]+):\s*(.*)$/, groups: ['ts', 'pid', 'tid', 'level', 'tag', 'msg'] },
    // MM-DD PID LEVEL/Tag: msg
    { re: /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d+)\s+([VDIWE])\/([^:]+):\s*(.*)$/, groups: ['ts', 'pid', 'level', 'tag', 'msg'] },
    // MM-DD PID LEVEL Tag: msg (space)
    { re: /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d+)\s+([VDIWE])\s+([^:]+):\s*(.*)$/, groups: ['ts', 'pid', 'level', 'tag', 'msg'] },
    // Short form LEVEL/Tag: msg
    { re: /^([VDIWE])\/([^\(\:]+)(?:\([0-9]+\))?:\s*(.*)$/, groups: ['level', 'tag', 'msg'] },
    // Short form LEVEL Tag: msg
    { re: /^([VDIWE])\s+([^\(\:]+)(?:\([0-9]+\))?:\s*(.*)$/, groups: ['level', 'tag', 'msg'] },
  ]

  for (const p of patterns) {
    const m = normalizedLine.match(p.re)
    if (m) {
      const g = p.groups
      const vals: Record<string, string> = {}
      for (let i = 0; i < g.length; i++) vals[g[i]] = m[i + 1]
      const ts = vals.ts
      if (ts) {
        const iso = tryIso(ts)
        if (iso) {
          entry.timestamp = ts
          entry._iso = iso
        } else {
          entry.timestamp = ts
        }
      }
      if (vals.level) entry.level = vals.level
      if (vals.tag) entry.tag = vals.tag.trim()
      entry.message = vals.msg || entry.message
      // Crash heuristics
      const msg = (entry.message || '').toString()
      const crash = /FATAL EXCEPTION/i.test(msg) || /\b([A-Za-z0-9_$.]+Exception)\b/.test(msg)
      if (crash) {
        entry.crash = true
        const exMatch = msg.match(/\b([A-Za-z0-9_$.]+Exception)\b/)
        if (exMatch) entry.exception = exMatch[1]
      }
      return entry
    }
  }

  // No pattern matched: attempt to extract level/tag like '... E/Tag: msg'
  const alt = normalizedLine.match(/([VDIWE])\/([^:]+):\s*(.*)$/)
  if (alt) {
    entry.level = alt[1]
    entry.tag = alt[2].trim()
    entry.message = alt[3]
    const msg = entry.message
    const crash = /FATAL EXCEPTION/i.test(msg) || /\b([A-Za-z0-9_$.]+Exception)\b/.test(msg)
    if (crash) {
      entry.crash = true
      const exMatch = msg.match(/\b([A-Za-z0-9_$.]+Exception)\b/)
      if (exMatch) entry.exception = exMatch[1]
    }
  }

  return entry
}
