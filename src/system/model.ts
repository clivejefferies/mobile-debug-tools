
export type HostOs = 'macos' | 'linux' | 'windows' | 'freebsd' | 'openbsd' | 'netbsd' | 'sunos' | 'unknown'

export type PlatformStatus = 'ready' | 'partially_ready' | 'unavailable' | 'unsupported'

export type ValidationStatus = 'valid' | 'invalid' | 'missing' | 'unsupported' | 'unknown'

export interface DiagnosticFailure {
  code: string
  platform: 'android' | 'ios'
  tool: string | null
  message: string
  searchedLocations: string[]
  selectedProvider: string | null
  rawVersion: string | null
  remediation: string[]
}

export interface ToolEntry {
  resolvedPath: string | null
  discoverySource: string | null
  parsedVersion: string | null
  rawVersionOutput: string | null
  validationStatus: ValidationStatus
}

export interface CapabilityEntry {
  probeRequired?: string
  availability: boolean
  selectedProvider: string | null
  blockingFailure: DiagnosticFailure | null
}

export interface PlatformEntry {
  status: PlatformStatus
  tools: Record<string, ToolEntry>
  providers: Record<string, { available: boolean; selected: boolean; tool: string | null; probeRequired?: string }>
  capabilities: Record<string, CapabilityEntry>
  devices: Array<Record<string, unknown>>
  failures: DiagnosticFailure[]
}
