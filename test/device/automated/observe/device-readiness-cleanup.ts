/** Attempt every restoration step and always close the MCP transport. */
export async function cleanupReadinessDevice(restore: boolean, adb: (...args: string[]) => unknown, close: () => Promise<void>) {
  const failures: unknown[] = []
  try {
    if (restore) {
      for (const args of [['shell', 'input', 'keyevent', '224'], ['shell', 'wm', 'dismiss-keyguard'], ['shell', 'input', 'keyevent', '3']]) {
        try { adb(...args) } catch (error) { failures.push(error) }
      }
    }
  } finally {
    try { await close() } catch (error) { failures.push(error) }
  }
  return failures
}
