/** ADB lists every device even with -s. Compare only this serial, independent of order. */
export function deviceForwards(table: string, deviceId: string): string[] {
  return table.split('\n').map(row => row.trim().split(/\s+/))
    .filter(columns => columns[0] === deviceId)
    .map(columns => columns.join(' ')).sort()
}

/** Cleanup is part of the assessment; a finally failure must never follow a PASS. */
export async function reportAfterCleanup<T>(
  work: () => Promise<T>,
  cleanup: () => Promise<void>,
  report: (status: 'PASS' | 'FAIL', evidence?: T, error?: unknown) => void,
): Promise<void> {
  let evidence: T | undefined
  let failed = false
  let failure: unknown
  try { evidence = await work() } catch (error) { failed = true; failure = error }
  try { await cleanup() } catch (error) {
    failure = failed ? new AggregateError([failure, error], `${String(failure)}; cleanup: ${String(error)}`) : error
    failed = true
  }
  if (failed) {
    report('FAIL', undefined, failure)
    throw failure
  }
  report('PASS', evidence)
}
