import { spawn } from 'child_process'
import { access, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { execAdb } from '../utils/android/utils.js'
import { execCmd } from '../utils/exec.js'

export type NetworkErrorCode =
  | 'timeout'
  | 'dns_error'
  | 'tls_error'
  | 'connection_refused'
  | 'connection_reset'
  | 'unknown_network_error'

export type NetworkActivityStatus = 'success' | 'failure' | 'retryable'
export type NetworkEventType = 'primary' | 'background'

interface ActiveNetworkCapture {
  proc: ReturnType<typeof spawn>
  captureFile: string
  logFile: string
  proxyHost: string
  proxyPort: number
  mitmdumpPath: string
  startedAt: number
}

interface RawCapturedNetworkEvent {
  timestamp?: unknown
  fullUrl?: unknown
  method?: unknown
  statusCode?: unknown
  networkError?: unknown
  durationMs?: unknown
}

interface CapturedNetworkEvent {
  timestamp: number
  fullUrl: string
  endpoint: string
  method: string
  statusCode: number | null
  networkError: NetworkErrorCode | null
  durationMs: number
  type: NetworkEventType
}

interface GetNetworkActivityResponse {
  requests: Array<{
    endpoint: string
    method: string
    statusCode: number | null
    networkError: NetworkErrorCode | null
    status: NetworkActivityStatus
    durationMs: number
  }>
  count: number
  error?: 'network_capture_unavailable'
  message?: string
}

interface NetworkCaptureStatusResponse {
  mitmdumpAvailable: boolean
  mitmdumpPath: string
  running: boolean
  captureFileConfigured: boolean
  captureFile: string | null
  logFile: string | null
  captureFileExists: boolean
  captureFileSizeBytes: number
  proxyHost: string | null
  proxyPort: number | null
  startedAt: number | null
  recentTlsFailureHosts: string[]
  issues: string[]
}

interface NetworkCertificateStatusResponse {
  certificateFileAvailable: boolean
  certificateFile: string | null
  certInstallerAvailable: boolean
  lockScreenDisabled: boolean | null
  recentTlsFailureHosts: string[]
  issues: string[]
}

export class ToolsNetwork {
  private static networkEvents: CapturedNetworkEvent[] = []
  private static lastActionTimestamp: number | null = null
  private static lastConsumedTimestamp = 0
  private static captureOffset = 0
  private static captureRemainder = ''
  private static capturePathForTests: string | null = null
  private static captureAvailableForTests: boolean | null = null
  private static certificatePathForTests: string | null = null
  private static activeCapture: ActiveNetworkCapture | null = null
  private static lastCaptureLogFile: string | null = null

  private static readonly backgroundEndpointTokens = ['/analytics', '/metrics', '/tracking', '/log', '/events', '/telemetry']
  private static readonly backgroundAssetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.css', '.js', '.svg', '.ico']
  private static readonly defaultProxyHost = '127.0.0.1'
  private static readonly defaultProxyPort = 8080

  private static getCapturePath(): string | null {
    return ToolsNetwork.capturePathForTests ?? process.env.MOBILE_DEBUG_MCP_NETWORK_CAPTURE_FILE ?? null
  }

  private static getCertificatePath(): string {
    return ToolsNetwork.certificatePathForTests
      ?? process.env.MITMPROXY_CA_CERT_PATH
      ?? path.join(os.homedir(), '.mitmproxy', 'mitmproxy-ca-cert.cer')
  }

  private static getMitmdumpPath(): string {
    return process.env.MITMDUMP_PATH || 'mitmdump'
  }

  private static async getAddonPath(): Promise<string> {
    const directPath = fileURLToPath(new URL('./mitmproxy_addon.py', import.meta.url))
    try {
      await access(directPath)
      return directPath
    } catch {
      const sourcePath = fileURLToPath(new URL('../../src/network/mitmproxy_addon.py', import.meta.url))
      await access(sourcePath)
      return sourcePath
    }
  }

  private static async checkMitmdumpAvailability(): Promise<{ available: boolean, path: string, message?: string }> {
    const mitmdumpPath = ToolsNetwork.getMitmdumpPath()

    try {
      const result = await execCmd(mitmdumpPath, ['--version'], { timeout: 5000 })
      if (result.exitCode === 0) return { available: true, path: mitmdumpPath }
      return { available: false, path: mitmdumpPath, message: result.stderr || result.stdout || 'mitmdump not available' }
    } catch (error) {
      return {
        available: false,
        path: mitmdumpPath,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private static async getLogFilePath(): Promise<string | null> {
    return ToolsNetwork.activeCapture?.logFile ?? ToolsNetwork.lastCaptureLogFile
  }

  private static parseRecentTlsFailureHosts(logText: string): string[] {
    const matches = [...logText.matchAll(/Client TLS handshake failed\. The client does not trust the proxy's certificate for ([^\s]+) /g)]
    return [...new Set(matches.map((match) => match[1]).filter(Boolean))]
  }

  private static async getRecentTlsFailureHosts(): Promise<string[]> {
    const logFile = await ToolsNetwork.getLogFilePath()
    if (!logFile) return []

    try {
      const logText = await readFile(logFile, 'utf8')
      return ToolsNetwork.parseRecentTlsFailureHosts(logText)
    } catch {
      return []
    }
  }

  private static async getLockScreenDisabled(deviceId?: string): Promise<boolean | null> {
    try {
      const output = await execAdb(['shell', 'cmd', 'lock_settings', 'get-disabled'], deviceId)
      const normalized = output.trim().toLowerCase()
      if (normalized === 'true') return true
      if (normalized === 'false') return false
      return null
    } catch {
      return null
    }
  }

  private static async isCertInstallerAvailable(deviceId?: string): Promise<boolean> {
    try {
      const output = await execAdb(['shell', 'pm', 'path', 'com.android.settings'], deviceId)
      return output.includes('package:')
    } catch {
      return false
    }
  }

  private static async convertCertificateToDer(certificateFile: string): Promise<string> {
    const outputPath = path.join(os.tmpdir(), `mobile-debug-network-certificate-${Date.now()}.cer`)
    const result = await execCmd('openssl', ['x509', '-in', certificateFile, '-outform', 'DER', '-out', outputPath], { timeout: 10000 })
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || 'Failed to convert certificate to DER')
    }
    return outputPath
  }

  private static clearCaptureCursor() {
    ToolsNetwork.captureOffset = 0
    ToolsNetwork.captureRemainder = ''
  }

  private static isCaptureAvailable(): boolean {
    if (ToolsNetwork.captureAvailableForTests !== null) return ToolsNetwork.captureAvailableForTests
    return !!ToolsNetwork.getCapturePath()
  }

  private static normalizeMethod(method: unknown): string {
    if (method === null || method === undefined) return 'GET'
    return String(method).trim().toUpperCase() || 'GET'
  }

  private static normalizeEndpoint(fullUrl: string): string {
    const trimmed = fullUrl.trim()
    if (!trimmed) return '/'

    let pathname = '/'

    try {
      const parsed = new URL(trimmed)
      pathname = parsed.pathname || '/'
    } catch {
      try {
        const parsed = new URL(trimmed, 'http://placeholder.local')
        pathname = parsed.pathname || '/'
      } catch {
        const withoutQuery = trimmed.split('?')[0] || '/'
        pathname = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
      }
    }

    let normalized = pathname.split('?')[0].trim().toLowerCase()
    if (!normalized.startsWith('/')) normalized = `/${normalized}`
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized || '/'
  }

  private static normalizeStatusCode(statusCode: unknown): number | null {
    if (statusCode === null || statusCode === undefined || statusCode === '') return null
    const parsed = Number(statusCode)
    if (!Number.isInteger(parsed) || parsed < 0) return null
    return parsed
  }

  private static normalizeDuration(durationMs: unknown): number {
    const parsed = Number(durationMs)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.round(parsed)
  }

  private static normalizeNetworkError(networkError: unknown): NetworkErrorCode | null {
    if (networkError === null || networkError === undefined || networkError === '') return null

    const value = String(networkError).trim().toLowerCase()
    if (!value) return null

    if (value === 'timeout' || value.includes('timed out') || value.includes('timeout')) return 'timeout'
    if (value === 'dns_error' || value.includes('dns') || value.includes('name resolution') || value.includes('host not found')) return 'dns_error'
    if (value === 'tls_error' || value.includes('tls') || value.includes('ssl') || value.includes('certificate') || value.includes('handshake')) return 'tls_error'
    if (value === 'connection_refused' || value.includes('connection refused')) return 'connection_refused'
    if (value === 'connection_reset' || value.includes('connection reset') || value.includes('reset by peer')) return 'connection_reset'
    if (value === 'unknown_network_error') return 'unknown_network_error'

    return 'unknown_network_error'
  }

  private static classifyEventType(endpoint: string, method: string): NetworkEventType {
    if (ToolsNetwork.backgroundEndpointTokens.some((token) => endpoint === token || endpoint.startsWith(`${token}/`) || endpoint.includes(`${token}/`) || endpoint.endsWith(token))) return 'background'
    if (method === 'GET' && ToolsNetwork.backgroundAssetExtensions.some((ext) => endpoint.endsWith(ext))) return 'background'
    return 'primary'
  }

  private static classifyStatus(statusCode: number | null, networkError: NetworkErrorCode | null): NetworkActivityStatus {
    if (networkError) return 'retryable'
    if (statusCode !== null && statusCode >= 200 && statusCode <= 299) return 'success'
    if (statusCode !== null && statusCode >= 400 && statusCode <= 499) return 'failure'
    return 'retryable'
  }

  private static normalizeCapturedEvent(raw: RawCapturedNetworkEvent): CapturedNetworkEvent {
    const timestamp = Number(raw.timestamp)
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('Captured network event is missing a valid timestamp')

    const fullUrl = typeof raw.fullUrl === 'string' ? raw.fullUrl.trim() : ''
    if (!fullUrl) throw new Error('Captured network event is missing fullUrl')

    const method = ToolsNetwork.normalizeMethod(raw.method)
    const statusCode = ToolsNetwork.normalizeStatusCode(raw.statusCode)
    const networkError = ToolsNetwork.normalizeNetworkError(raw.networkError)
    const durationMs = ToolsNetwork.normalizeDuration(raw.durationMs)

    if (statusCode === null && networkError === null) {
      throw new Error('Captured network event must include either statusCode or networkError')
    }

    if (statusCode !== null && networkError !== null) {
      throw new Error('Captured network event cannot include both statusCode and networkError')
    }

    const endpoint = ToolsNetwork.normalizeEndpoint(fullUrl)
    const type = ToolsNetwork.classifyEventType(endpoint, method)

    return {
      timestamp,
      fullUrl,
      endpoint,
      method,
      statusCode,
      networkError,
      durationMs,
      type
    }
  }

  private static appendEvent(raw: RawCapturedNetworkEvent) {
    ToolsNetwork.networkEvents.push(ToolsNetwork.normalizeCapturedEvent(raw))
    ToolsNetwork.networkEvents.sort((left, right) => left.timestamp - right.timestamp)
  }

  private static async ingestCaptureEvents(): Promise<{ ok: true } | { ok: false, message: string }> {
    if (!ToolsNetwork.isCaptureAvailable()) {
      return { ok: false, message: 'Network capture is not configured. Set MOBILE_DEBUG_MCP_NETWORK_CAPTURE_FILE and run the mitmproxy addon.' }
    }

    const capturePath = ToolsNetwork.getCapturePath()
    if (ToolsNetwork.captureAvailableForTests === true && !capturePath) {
      return { ok: true }
    }

    if (!capturePath) {
      return { ok: false, message: 'Network capture file path is unavailable.' }
    }

    try {
      const content = await readFile(capturePath)
      if (content.length < ToolsNetwork.captureOffset) {
        ToolsNetwork.captureOffset = 0
        ToolsNetwork.captureRemainder = ''
      }

      const nextChunk = content.subarray(ToolsNetwork.captureOffset).toString('utf8')
      ToolsNetwork.captureOffset = content.length

      if (!nextChunk) return { ok: true }

      const combined = `${ToolsNetwork.captureRemainder}${nextChunk}`
      const endsWithNewline = combined.endsWith('\n')
      const lines = combined.split('\n')
      ToolsNetwork.captureRemainder = endsWithNewline ? '' : (lines.pop() ?? '')

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const parsed = JSON.parse(trimmed) as RawCapturedNetworkEvent
        ToolsNetwork.appendEvent(parsed)
      }

      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  static recordActionSuccess(timestamp = Date.now()) {
    ToolsNetwork.lastActionTimestamp = timestamp
  }

  static async getNetworkCaptureStatusHandler(): Promise<NetworkCaptureStatusResponse> {
    const mitmdump = await ToolsNetwork.checkMitmdumpAvailability()
    const captureFile = ToolsNetwork.getCapturePath()
    const logFile = await ToolsNetwork.getLogFilePath()
    const running = !!(ToolsNetwork.activeCapture && !ToolsNetwork.activeCapture.proc.killed && ToolsNetwork.activeCapture.proc.exitCode === null)
    const issues: string[] = []
    const recentTlsFailureHosts = await ToolsNetwork.getRecentTlsFailureHosts()

    let captureFileExists = false
    let captureFileSizeBytes = 0

    if (captureFile) {
      try {
        const fileStat = await stat(captureFile)
        captureFileExists = true
        captureFileSizeBytes = fileStat.size
      } catch {
        captureFileExists = false
      }
    }

    if (!mitmdump.available) issues.push(`mitmdump unavailable: ${mitmdump.message || 'not found'}`)
    if (!captureFile) issues.push('capture file is not configured')
    if (captureFile && !captureFileExists) issues.push('capture file does not exist yet')
    if (!running) issues.push('network capture process is not running')
    if (recentTlsFailureHosts.length > 0) issues.push(`device does not trust the proxy certificate for: ${recentTlsFailureHosts.join(', ')}`)

    return {
      mitmdumpAvailable: mitmdump.available,
      mitmdumpPath: mitmdump.path,
      running,
      captureFileConfigured: !!captureFile,
      captureFile,
      logFile,
      captureFileExists,
      captureFileSizeBytes,
      proxyHost: ToolsNetwork.activeCapture?.proxyHost ?? null,
      proxyPort: ToolsNetwork.activeCapture?.proxyPort ?? null,
      startedAt: ToolsNetwork.activeCapture?.startedAt ?? null,
      recentTlsFailureHosts,
      issues
    }
  }

  static async getNetworkCertificateStatusHandler({ deviceId }: { deviceId?: string } = {}): Promise<NetworkCertificateStatusResponse> {
    const certificateFile = ToolsNetwork.getCertificatePath()
    const issues: string[] = []

    let certificateFileAvailable = false
    try {
      const fileStat = await stat(certificateFile)
      certificateFileAvailable = fileStat.isFile()
    } catch {
      certificateFileAvailable = false
    }

    const certInstallerAvailable = await ToolsNetwork.isCertInstallerAvailable(deviceId)
    const lockScreenDisabled = await ToolsNetwork.getLockScreenDisabled(deviceId)
    const recentTlsFailureHosts = await ToolsNetwork.getRecentTlsFailureHosts()

    if (!certificateFileAvailable) issues.push(`mitmproxy CA certificate not found at ${certificateFile}`)
    if (!certInstallerAvailable) issues.push('Android certificate installer is unavailable on the target device')
    if (lockScreenDisabled === true) issues.push('Android requires a secure lock screen before installing a CA certificate')
    if (recentTlsFailureHosts.length > 0) issues.push(`recent proxy trust failures detected for: ${recentTlsFailureHosts.join(', ')}`)

    return {
      certificateFileAvailable,
      certificateFile,
      certInstallerAvailable,
      lockScreenDisabled,
      recentTlsFailureHosts,
      issues
    }
  }

  static async startNetworkCaptureHandler({
    host = ToolsNetwork.defaultProxyHost,
    port = ToolsNetwork.defaultProxyPort,
    captureFile
  }: {
    host?: string
    port?: number
    captureFile?: string
  } = {}) {
    const existing = ToolsNetwork.activeCapture
    if (existing && !existing.proc.killed && existing.proc.exitCode === null) {
      return {
        success: true,
        started: false,
        alreadyRunning: true,
        proxyHost: existing.proxyHost,
        proxyPort: existing.proxyPort,
        captureFile: existing.captureFile,
        mitmdumpPath: existing.mitmdumpPath
      }
    }

    const mitmdump = await ToolsNetwork.checkMitmdumpAvailability()
    if (!mitmdump.available) {
      return {
        success: false,
        started: false,
        error: mitmdump.message || 'mitmdump unavailable'
      }
    }

    const resolvedCaptureFile = captureFile || path.join(os.tmpdir(), 'mobile-debug-network-capture.ndjson')
    const resolvedLogFile = path.join(os.tmpdir(), 'mobile-debug-network-capture.log')
    await mkdir(path.dirname(resolvedCaptureFile), { recursive: true })
    await writeFile(resolvedCaptureFile, '', 'utf8')
    await writeFile(resolvedLogFile, '', 'utf8')

    process.env.MOBILE_DEBUG_MCP_NETWORK_CAPTURE_FILE = resolvedCaptureFile
    ToolsNetwork.clearCaptureCursor()

    const args = [
      '--listen-host', host,
      '--listen-port', String(port),
      '-s', await ToolsNetwork.getAddonPath()
    ]
    const proc = spawn(mitmdump.path, args, {
      env: { ...process.env, MOBILE_DEBUG_MCP_NETWORK_CAPTURE_FILE: resolvedCaptureFile }
    })

    proc.stdout?.on('data', (chunk) => {
      void writeFile(resolvedLogFile, chunk.toString(), { encoding: 'utf8', flag: 'a' })
    })
    proc.stderr?.on('data', (chunk) => {
      void writeFile(resolvedLogFile, chunk.toString(), { encoding: 'utf8', flag: 'a' })
    })

    const startedAt = Date.now()
    const activeCapture: ActiveNetworkCapture = {
      proc,
      captureFile: resolvedCaptureFile,
      logFile: resolvedLogFile,
      proxyHost: host,
      proxyPort: port,
      mitmdumpPath: mitmdump.path,
      startedAt
    }
    ToolsNetwork.activeCapture = activeCapture
    ToolsNetwork.lastCaptureLogFile = resolvedLogFile

    proc.on('close', () => {
      if (ToolsNetwork.activeCapture?.proc === proc) {
        ToolsNetwork.activeCapture = null
      }
    })

    const started = await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      const timer = setTimeout(() => finish(proc.exitCode === null), 500)
      proc.once('error', () => {
        clearTimeout(timer)
        finish(false)
      })
      proc.once('exit', () => {
        clearTimeout(timer)
        finish(false)
      })
    })

    if (!started) {
      const logs = await readFile(resolvedLogFile, 'utf8').catch(() => '')
      ToolsNetwork.activeCapture = null
      return {
        success: false,
        started: false,
        error: logs.trim() || 'Failed to start mitmdump'
      }
    }

    return {
      success: true,
      started: true,
      proxyHost: host,
      proxyPort: port,
      captureFile: resolvedCaptureFile,
      mitmdumpPath: mitmdump.path
    }
  }

  static async stopNetworkCaptureHandler() {
    const activeCapture = ToolsNetwork.activeCapture
    if (!activeCapture) return { success: true, stopped: true }

    try {
      activeCapture.proc.kill()
    } catch (error) {
      return {
        success: false,
        stopped: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }

    ToolsNetwork.activeCapture = null
    return { success: true, stopped: true }
  }

  static async prepareNetworkCertificateInstallHandler({
    deviceId,
    pin,
    certificateFile
  }: {
    deviceId?: string
    pin?: string
    certificateFile?: string
  } = {}) {
    const resolvedCertificateFile = certificateFile || ToolsNetwork.getCertificatePath()

    try {
      await access(resolvedCertificateFile)
    } catch {
      return {
        success: false,
        launched: false,
        manualStepRequired: false,
        error: `mitmproxy CA certificate not found at ${resolvedCertificateFile}`
      }
    }

    const certInstallerAvailable = await ToolsNetwork.isCertInstallerAvailable(deviceId)
    if (!certInstallerAvailable) {
      return {
        success: false,
        launched: false,
        manualStepRequired: false,
        error: 'Android Settings credential installer is unavailable on the target device'
      }
    }

    const lockScreenDisabled = await ToolsNetwork.getLockScreenDisabled(deviceId)
    let lockScreenConfigured = false
    if (lockScreenDisabled === true) {
      if (!pin) {
        return {
          success: false,
          launched: false,
          manualStepRequired: false,
          error: 'Android requires a secure lock screen before installing a CA certificate. Provide a pin to configure one automatically.'
        }
      }

      try {
        await execAdb(['shell', 'cmd', 'lock_settings', 'set-pin', pin], deviceId)
        lockScreenConfigured = true
      } catch (error) {
        return {
          success: false,
          launched: false,
          manualStepRequired: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }

    let convertedCertificateFile: string | null = null
    const devicePath = '/data/local/tmp/mitmproxy-ca-cert-der.cer'

    try {
      convertedCertificateFile = await ToolsNetwork.convertCertificateToDer(resolvedCertificateFile)
      await execAdb(['push', convertedCertificateFile, devicePath], deviceId)
      await execAdb(['shell', 'chmod', '644', devicePath], deviceId)
      await execAdb([
        'shell',
        'am',
        'start',
        '-a',
        'com.android.credentials.INSTALL',
        '-n',
        'com.android.settings/.security.CredentialStorage',
        '-d',
        `file://${devicePath}`,
        '-t',
        'application/pkix-cert'
      ], deviceId)
    } catch (error) {
      return {
        success: false,
        launched: false,
        manualStepRequired: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      if (convertedCertificateFile) {
        await rm(convertedCertificateFile, { force: true }).catch(() => {})
      }
    }

    return {
      success: true,
      launched: true,
      manualStepRequired: true,
      certificateFile: resolvedCertificateFile,
      devicePath,
      lockScreenConfigured,
      message: 'Settings certificate flow launched. Complete the final confirmation in Android Settings; Android does not allow silent CA installation on non-rooted devices.'
    }
  }

  static async getNetworkActivityHandler(): Promise<GetNetworkActivityResponse> {
    const ingest = await ToolsNetwork.ingestCaptureEvents()
    if (!ingest.ok) {
      return {
        requests: [],
        count: 0,
        error: 'network_capture_unavailable',
        message: ingest.message
      }
    }

    if (ToolsNetwork.lastActionTimestamp === null) {
      return { requests: [], count: 0 }
    }

    const selected = ToolsNetwork.networkEvents
      .filter((event) => event.timestamp > ToolsNetwork.lastActionTimestamp! && event.timestamp > ToolsNetwork.lastConsumedTimestamp)
      .sort((left, right) => left.timestamp - right.timestamp)

    const primaryEvents = selected.filter((event) => event.type === 'primary')
    const returned = primaryEvents.length > 0 ? primaryEvents : selected

    if (returned.length === 0) {
      return { requests: [], count: 0 }
    }

    const requests = returned.map((event) => ({
      endpoint: event.endpoint,
      method: event.method,
      statusCode: event.statusCode,
      networkError: event.networkError,
      status: ToolsNetwork.classifyStatus(event.statusCode, event.networkError),
      durationMs: event.durationMs
    }))

    ToolsNetwork.lastConsumedTimestamp = selected[selected.length - 1].timestamp

    return {
      requests,
      count: requests.length
    }
  }

  static _appendCapturedEventForTests(raw: RawCapturedNetworkEvent) {
    ToolsNetwork.appendEvent(raw)
  }

  static _setCaptureAvailableForTests(value: boolean | null) {
    ToolsNetwork.captureAvailableForTests = value
  }

  static _setCapturePathForTests(value: string | null) {
    ToolsNetwork.capturePathForTests = value
  }

  static _setCertificatePathForTests(value: string | null) {
    ToolsNetwork.certificatePathForTests = value
  }

  static _getStateForTests() {
    return {
      networkEvents: [...ToolsNetwork.networkEvents],
      lastActionTimestamp: ToolsNetwork.lastActionTimestamp,
      lastConsumedTimestamp: ToolsNetwork.lastConsumedTimestamp
    }
  }

  static _resetForTests() {
    ToolsNetwork.networkEvents = []
    ToolsNetwork.lastActionTimestamp = null
    ToolsNetwork.lastConsumedTimestamp = 0
    ToolsNetwork.clearCaptureCursor()
    ToolsNetwork.captureAvailableForTests = null
    ToolsNetwork.capturePathForTests = null
    ToolsNetwork.certificatePathForTests = null
    if (ToolsNetwork.activeCapture) {
      try { ToolsNetwork.activeCapture.proc.kill() } catch { }
    }
    ToolsNetwork.activeCapture = null
    ToolsNetwork.lastCaptureLogFile = null
  }
}
