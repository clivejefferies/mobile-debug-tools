/** Omit only repeated target metadata; preserve all execution and failure evidence. */
export function debuggerResponse(command: string, mode: 'compact' | 'debug', payload: Record<string, unknown>) {
  if (mode !== 'compact' || ['capabilities', 'attach', 'state'].includes(command) || payload.debug_session_id == null) return payload
  const result = { ...payload }
  for (const field of ['device', 'target', 'capabilities']) delete result[field]
  return result
}
