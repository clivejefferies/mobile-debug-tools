import { fileURLToPath } from 'node:url'
import { getXcrunCmd } from '../utils/ios/utils.js'
import { iosExec } from './ios.js'
import { DebuggerProcess, type WorkerEvent, type DebugWorker } from './worker.js'
import { DebuggerError } from './diagnostics.js'
export const iosCapabilities = { attach: true, breakpoints: true, stacks: true, locals: true, step: true, resume: true,
  evaluation: false, mutation: false, coroutines: false, native: false, async_execution_inspection: true, async_stepping: true }
export const iosLimitations = ['IOS_SIMULATOR_ONLY', 'DEBUG_METADATA_REQUIRED', 'SHALLOW_LOCALS', 'ALL_THREADS_SUSPEND', 'DEVICE_WIDE_UI_GUARD', 'ASYNC_STEPPING_TOOLCHAIN_DEPENDENT', 'AGGREGATE_VALUES_TYPE_ONLY', 'NO_TASK_ENUMERATION']
export const iosWorkerSource = fileURLToPath(new URL('../../src/debugger/lldb/worker.py', import.meta.url))
export async function prepareIOSWorker() {
  if (process.platform !== 'darwin') throw new DebuggerError('DEBUGGER_UNSUPPORTED')
  const pythonPath = await iosExec(getXcrunCmd(), ['lldb', '-P'])
  const python = await iosExec(getXcrunCmd(), ['--find', 'python3'])
  // Ignore user Python startup/customisation and LLDB init files.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, PYTHONPATH: pythonPath, PYTHONNOUSERSITE: '1' }
  const ready = await iosExec(python, ['-s', '-B', '-c', 'import lldb; d=lldb.SBDebugger.Create(False); print("ready" if d.IsValid() else "unavailable"); lldb.SBDebugger.Destroy(d)'], env)
  if (ready !== 'ready') throw new DebuggerError('DEBUGGER_UNSUPPORTED')
  return { python, env }
}
export async function createIOSWorker(onEvent: (event: WorkerEvent) => void) {
  const { python, env } = await prepareIOSWorker()
  let released = false
  const worker = new DebuggerProcess(python, '', event => {
    if (event.event === 'terminated' && ['process_exit', 'detached', 'pause_limit', 'idle_limit', 'session_limit'].includes(String(event.reason))) released = true
    onEvent(event)
  }, { args: ['-u', '-s', '-B', iosWorkerSource], env })
  return new IOSWorker(worker, () => released)
}
/** A dead worker is not proof that its owned suspension was released. */
export class IOSWorker implements DebugWorker {
  private detached = false
  constructor(private worker: DebugWorker, private released: () => boolean) {}
  async call(command: string, args: Record<string, unknown> = {}, timeout = 10000) {
    const result = await this.worker.call(command, args, timeout)
    if (command === 'detach' && result.detached === true) this.detached = true
    return result
  }
  async close() {
    if (!this.detached && !this.released()) {
      try { await this.call('detach', {}, 1000) } catch { /* Report uncertainty after bounded transport shutdown. */ }
    }
    await this.worker.close()
    if (!this.detached && !this.released()) throw new DebuggerError('DEBUGGER_CLEANUP_FAILED')
  }
}
