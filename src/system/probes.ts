import { spawnSync } from 'child_process'
import path from 'path'
import type { HostOs, ValidationStatus, DiagnosticFailure, ToolEntry } from './model.js'

export function normalizeHostOs(platform: NodeJS.Platform): HostOs {
  switch (platform) {
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    case 'win32':
      return 'windows'
    case 'freebsd':
    case 'openbsd':
    case 'netbsd':
    case 'sunos':
      return platform
    default:
      return 'unknown'
  }
}

export function isSupportedHost(hostOs: HostOs): boolean {
  return hostOs === 'macos' || hostOs === 'linux' || hostOs === 'windows'
}

export function firstVersionToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = String(raw).match(/(\d+(?:\.\d+)+|\d+)/)
  return match?.[1] ?? null
}

export function probeCommand(command: string, args: string[], timeoutMs = 2000): { ok: boolean, raw: string | null, parsedVersion: string | null } {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] })
    const raw = `${result.stdout || ''}${result.stderr || ''}`.trim() || null
    return {
      ok: result.status === 0,
      raw,
      parsedVersion: firstVersionToken(raw)
    }
  } catch {
    return { ok: false, raw: null, parsedVersion: null }
  }
}

export function makeFailure(
  code: string,
  platform: 'android' | 'ios',
  message: string,
  opts: Partial<DiagnosticFailure> = {}
): DiagnosticFailure {
  return {
    code,
    platform,
    tool: opts.tool ?? null,
    message,
    searchedLocations: opts.searchedLocations ?? [],
    selectedProvider: opts.selectedProvider ?? null,
    rawVersion: opts.rawVersion ?? null,
    remediation: opts.remediation ?? []
  }
}

export function makeToolEntry(
  resolvedPath: string | null,
  discoverySource: string | null,
  rawVersionOutput: string | null,
  validationStatus: ValidationStatus
): ToolEntry {
  return {
    resolvedPath,
    discoverySource,
    parsedVersion: firstVersionToken(rawVersionOutput),
    rawVersionOutput,
    validationStatus
  }
}

export function describeAdbDiscovery(adbCmd: string): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['ADB_PATH', 'ANDROID_SDK_ROOT/platform-tools/adb', 'ANDROID_HOME/platform-tools/adb', '~/Library/Android/sdk/platform-tools/adb', 'PATH']
  if (process.env.ADB_PATH && process.env.ADB_PATH.trim()) return { discoverySource: 'ADB_PATH', searchedLocations }
  if (process.env.ANDROID_SDK_ROOT) return { discoverySource: 'ANDROID_SDK_ROOT', searchedLocations }
  if (process.env.ANDROID_HOME) return { discoverySource: 'ANDROID_HOME', searchedLocations }
  if (adbCmd.includes('Library/Android/sdk')) return { discoverySource: 'HOME_SDK', searchedLocations }
  if (adbCmd === 'adb') return { discoverySource: 'PATH_OR_FALLBACK', searchedLocations }
  return { discoverySource: 'PATH', searchedLocations }
}

export function describeXcrunDiscovery(xcrunCmd: string): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['XCRUN_PATH', 'PATH']
  if (process.env.XCRUN_PATH && process.env.XCRUN_PATH.trim()) return { discoverySource: 'XCRUN_PATH', searchedLocations }
  return { discoverySource: xcrunCmd === 'xcrun' ? 'PATH' : 'PATH', searchedLocations }
}

export function describeIdbDiscovery(idbCmd: string): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['MCP_IDB_PATH', 'IDB_PATH', 'mcp.config.json', '~/.mcp/config.json', 'PATH', '/opt/homebrew/bin/idb', '/usr/local/bin/idb']
  if (process.env.MCP_IDB_PATH && process.env.MCP_IDB_PATH.trim()) return { discoverySource: 'MCP_IDB_PATH', searchedLocations }
  if (process.env.IDB_PATH && process.env.IDB_PATH.trim()) return { discoverySource: 'IDB_PATH', searchedLocations }
  return { discoverySource: idbCmd === 'idb' ? 'PATH_OR_FALLBACK' : 'PATH', searchedLocations }
}

export function describeJavaDiscovery(javaHome: string | null): { discoverySource: string | null, searchedLocations: string[] } {
  const searchedLocations: string[] = ['GRADLE_JAVA_HOME', 'JAVA_HOME', 'GRADLE_HOME', 'detectJavaHome']
  if (process.env.GRADLE_JAVA_HOME && process.env.GRADLE_JAVA_HOME.trim()) return { discoverySource: 'GRADLE_JAVA_HOME', searchedLocations }
  if (process.env.JAVA_HOME && process.env.JAVA_HOME.trim()) return { discoverySource: 'JAVA_HOME', searchedLocations }
  if (process.env.GRADLE_HOME && process.env.GRADLE_HOME.trim()) return { discoverySource: 'GRADLE_HOME', searchedLocations }
  return { discoverySource: javaHome ? 'detected' : null, searchedLocations }
}

export function resolveJavaBinaryPath(javaHome: string, hostOs: HostOs): string {
  const javaBinary = hostOs === 'windows' ? 'java.exe' : 'java'
  return path.join(javaHome, 'bin', javaBinary)
}
