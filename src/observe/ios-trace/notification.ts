import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getXcrunCmd } from '../../utils/ios/utils.js'
import { traceCommand, spawnTrace, stopTraceChild, type TraceSpawn, type OwnedTraceChild } from './process.js'

// A private per-session listener avoids requiring a third-party notification utility.
const source = `#include <notify.h>
#include <dispatch/dispatch.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  int token;
  if (notify_register_dispatch(argv[1], &token, dispatch_get_main_queue(), ^(int t) {
    puts("READY"); fflush(stdout); notify_cancel(t); exit(0);
  }) != NOTIFY_STATUS_OK) return 3;
  puts("ARMED"); fflush(stdout); dispatch_main();
}`
export async function prepareNotification(directory: string, spawn: TraceSpawn = spawnTrace) {
  const file = path.join(directory, 'notification.c'), binary = path.join(directory, 'notification')
  await fs.writeFile(file, source, { mode: 0o600 })
  await traceCommand(getXcrunCmd(), ['clang', '-fblocks', file, '-o', binary], 30000, spawn)
  await fs.chmod(binary, 0o700)
  return binary
}
export async function listenNotification(binary: string, name: string, spawn: TraceSpawn = spawnTrace): Promise<OwnedTraceChild> {
  const listener = spawn(binary, [name], 40000)
  try { await listener.line('ARMED', 5000); return listener }
  catch (error) { await stopTraceChild(listener, 1000).catch(() => {}); throw error }
}
