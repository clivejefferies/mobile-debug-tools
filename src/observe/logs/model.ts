/** Fields consumed from persisted NDJSON log events; other fields pass through. */
export interface StreamLogEntry {
  timestamp?: string | number | null
  _iso?: string | null
  level?: string
  message?: string
  exception?: string
  crash?: boolean
}

export interface LogFilters { appId?: string; deviceId?: string; pid?: number; tag?: string; level?: string; contains?: string; since_seconds?: number; limit?: number }
