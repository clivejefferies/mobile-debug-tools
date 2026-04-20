import { execAdb, parseLogLine } from '../utils/android/utils.js'
import { execCommand } from '../utils/ios/utils.js'

export type NetworkErrorCode =
  | 'timeout'
  | 'dns_error'
  | 'tls_error'
  | 'connection_refused'
  | 'connection_reset'
  | 'unknown_network_error'

export type NetworkActivityStatus = 'success' | 'failure' | 'retryable'

export interface NetworkEvent {
  endpoint: string
  method: string
  statusCode: number | null
  networkError: NetworkErrorCode | null
  status: NetworkActivityStatus
  durationMs: number
}

export interface GetNetworkActivityResult {
  requests: NetworkEvent[]
  count: number
}

// ─── Module state ─────────────────────────────────────────────────────────────
// lastActionTimestamp: set when an action tool fires (tap, swipe, etc.)
// lastConsumedTimestamp: advanced after each get_network_activity call to prevent duplicates
let lastActionTimestamp = 0
let lastConsumedTimestamp = 0

export function notifyActionStart(): void {
  lastActionTimestamp = Date.now()
  lastConsumedTimestamp = 0
}

/** Exposed for unit tests only. */
export function _setTimestampsForTests(actionTs: number, consumedTs: number): void {
  lastActionTimestamp = actionTs
  lastConsumedTimestamp = consumedTs
}

// ─── Parsing constants ────────────────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s"'\]\)><]+/
const PATH_RE = /\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/
const METHOD_RE = /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/

const NETWORK_ERROR_PATTERNS: Array<{ re: RegExp; code: NetworkErrorCode }> = [
  { re: /timed?\s*out|timeout/i, code: 'timeout' },
  { re: /dns|name[\s_]resolution|host\s*not\s*found|nodename/i, code: 'dns_error' },
  { re: /\btls\b|\bssl\b|certificate|handshake/i, code: 'tls_error' },
  { re: /connection\s*refused/i, code: 'connection_refused' },
  { re: /connection\s*reset|reset\s*by\s*peer/i, code: 'connection_reset' },
]

const BACKGROUND_TOKENS = ['/analytics', '/metrics', '/tracking', '/log', '/events', '/telemetry', '/ping', '/beacon']
const BACKGROUND_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.css', '.js', '.svg', '.ico', '.woff', '.ttf']
const FILESYSTEM_PREFIXES = ['/data/', '/system/', '/apex/', '/proc/', '/dev/', '/vendor/', '/product/', '/storage/', '/sdcard/', '/mnt/', '/odm/', '/cache/', '/metadata/', '/acct/', '/sys/']
const FILESYSTEM_EXTENSIONS = ['.apk', '.apex', '.odex', '.vdex', '.dex', '.so', '.jar', '.bin', '.img', '.db', '.sqlite', '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.m', '.mm', '.kt', '.java', '.swift']

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function extractUrl(text: string): string | null {
  const m = text.match(URL_RE)
  return m ? m[0] : null
}

function isPlausibleEndpointPath(path: string): boolean {
  const lower = path.toLowerCase()
  if (!lower.startsWith('/')) return false
  if (FILESYSTEM_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false
  if (FILESYSTEM_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false
  return true
}

function extractPath(text: string): string | null {
  const m = text.match(PATH_RE)
  if (!m) return null
  return isPlausibleEndpointPath(m[0]) ? m[0] : null
}

function toStatusCode(value: string | undefined): number | null {
  if (!value) return null
  const code = Number(value)
  return code >= 100 && code <= 599 ? code : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractStatusCode(text: string, url: string | null, path: string | null, method: string | null): number | null {
  const directHttpMatch = text.match(/\bHTTP\/\d(?:\.\d)?\s+([1-5]\d{2})\b/i) || text.match(/\bHTTP\s+([1-5]\d{2})\b/i)
  if (directHttpMatch) return toStatusCode(directHttpMatch[1])

  const endpointToken = url || path
  const hasEndpointContext = endpointToken !== null
  if (!hasEndpointContext && method === null) return null

  const labeledMatch = text.match(/\b(?:status(?:\s*code)?|response(?:\s*code)?)\s*[:=]?\s*([1-5]\d{2})\b/i)
  if (labeledMatch && hasEndpointContext) return toStatusCode(labeledMatch[1])

  if (endpointToken) {
    const escapedEndpoint = escapeRegExp(endpointToken)
    const endpointThenCode = new RegExp(`${escapedEndpoint}[^\\n]*?\\b([1-5]\\d{2})\\b`, 'i')
    const codeThenEndpoint = new RegExp(`\\b([1-5]\\d{2})\\b[^\\n]*?${escapedEndpoint}`, 'i')
    const contextualMatch = text.match(endpointThenCode) || text.match(codeThenEndpoint)
    if (contextualMatch) return toStatusCode(contextualMatch[1])
  }

  if (method !== null && path !== null) {
    const methodPathCodeMatch = text.match(/\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b[^\n]*?\b([1-5]\d{2})\b/i)
    if (methodPathCodeMatch) return toStatusCode(methodPathCodeMatch[1])
  }

  return null
}

function extractMethod(text: string): string | null {
  const m = text.match(METHOD_RE)
  return m ? m[1] : null
}

function detectNetworkError(text: string): NetworkErrorCode | null {
  for (const { re, code } of NETWORK_ERROR_PATTERNS) {
    if (re.test(text)) return code
  }
  return null
}

export function normalizeEndpoint(raw: string): string {
  try {
    const u = new URL(raw.startsWith('/') ? `https://x${raw}` : raw)
    const p = u.pathname.toLowerCase().replace(/\/+$/, '')
    return p || '/'
  } catch {
    return raw.toLowerCase().replace(/\?.*$/, '').replace(/\/+$/, '') || '/'
  }
}

export function classifyStatus(statusCode: number | null, networkError: NetworkErrorCode | null): NetworkActivityStatus {
  if (networkError !== null) return 'retryable'
  if (statusCode === null) return 'success' // request detected, no failure signal
  if (statusCode >= 200 && statusCode <= 299) return 'success'
  if (statusCode >= 400 && statusCode <= 499) return 'failure'
  return 'retryable' // 5xx, 1xx, 3xx
}

function meetsEmissionCriteria(url: string | null, path: string | null, statusCode: number | null, method: string | null): boolean {
  if (url !== null) return true                      // condition 1: full http/https URL
  if (statusCode !== null) return true               // condition 2: valid HTTP status code
  if (method !== null && path !== null) return true  // condition 3: method + path
  return false
}

function classifyEventType(endpoint: string): 'primary' | 'background' {
  const lower = endpoint.toLowerCase()
  if (BACKGROUND_TOKENS.some(t => lower.includes(t))) return 'background'
  if (BACKGROUND_EXTENSIONS.some(e => lower.endsWith(e))) return 'background'
  return 'primary'
}

function filterToSignificantEvents(events: NetworkEvent[]): NetworkEvent[] {
  if (events.length === 0) return events
  const hasPrimary = events.some(e => classifyEventType(e.endpoint) === 'primary')
  return hasPrimary ? events.filter(e => classifyEventType(e.endpoint) === 'primary') : events
}

/** Exported for unit testing. */
export function parseMessageToEvent(message: string): NetworkEvent | null {
  const url = extractUrl(message)
  const path = url ? null : extractPath(message)
  const method = extractMethod(message)
  const statusCode = extractStatusCode(message, url, path, method)
  const networkError = detectNetworkError(message)

  if (!meetsEmissionCriteria(url, path, statusCode, method)) return null

  const rawEndpoint = url || path || 'unknown'
  return {
    endpoint: normalizeEndpoint(rawEndpoint),
    method: method || 'unknown',
    statusCode,
    networkError,
    status: classifyStatus(statusCode, networkError),
    durationMs: 0
  }
}

// ─── Android ─────────────────────────────────────────────────────────────────

async function getAndroidEvents(sinceMs: number, deviceId?: string): Promise<NetworkEvent[]> {
  try {
    const stdout = await execAdb(['logcat', '-d', '-v', 'threadtime', '*:V', '-t', '2000'], deviceId)
    const lines = stdout ? stdout.split(/\r?\n/).filter(Boolean) : []

    const events: NetworkEvent[] = []
    for (const line of lines) {
      const parsed = parseLogLine(line)
      if (parsed._iso) {
        const ts = new Date(parsed._iso).getTime()
        if (ts > 0 && ts <= sinceMs) continue
      }
      const event = parseMessageToEvent(parsed.message || line)
      if (event) events.push(event)
    }
    return events
  } catch {
    return []
  }
}

// ─── iOS ─────────────────────────────────────────────────────────────────────

async function getIOSEvents(sinceMs: number, deviceId = 'booted'): Promise<NetworkEvent[]> {
  try {
    const lookbackSeconds = Math.max(15, Math.ceil((Date.now() - sinceMs) / 1000) + 5)
    const args = [
      'simctl', 'spawn', deviceId, 'log', 'show',
      '--last', `${lookbackSeconds}s`,
      '--style', 'syslog',
      '--predicate', 'eventMessage contains "http" OR eventMessage contains "URLSession" OR eventMessage contains "Task <" OR eventMessage contains "HTTP/"'
    ]
    const result = await execCommand(args, deviceId)
    const lines = result.output ? result.output.split(/\r?\n/).filter(Boolean) : []

    const events: NetworkEvent[] = []
    for (const line of lines) {
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
      if (tsMatch) {
        const ts = new Date(tsMatch[1]).getTime()
        if (ts > 0 && ts <= sinceMs) continue
      }
      const event = parseMessageToEvent(line)
      if (event) events.push(event)
    }
    return events
  } catch {
    return []
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class ToolsNetwork {
  static notifyActionStart(): void {
    notifyActionStart()
  }

  static async getNetworkActivity(params: { platform: string; deviceId?: string }): Promise<GetNetworkActivityResult> {
    const { platform, deviceId } = params

    const sinceMs = lastConsumedTimestamp > lastActionTimestamp
      ? lastConsumedTimestamp
      : lastActionTimestamp > 0 ? lastActionTimestamp : Date.now() - 30000

    const raw = platform === 'android'
      ? await getAndroidEvents(sinceMs, deviceId)
      : await getIOSEvents(sinceMs, deviceId)

    const requests = filterToSignificantEvents(raw)
    lastConsumedTimestamp = Date.now()

    return { requests, count: requests.length }
  }
}
