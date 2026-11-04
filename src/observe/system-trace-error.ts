export class TraceError extends Error {
  constructor(public code: string) { super(code) }
}
