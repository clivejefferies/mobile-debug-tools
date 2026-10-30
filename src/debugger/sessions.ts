import type { WorkerReply } from './protocol.js';
import { registerDebuggerPauseProvider } from './guard.js';
import { randomUUID } from 'node:crypto';
import { AndroidDebugNative, type DebugNative, type DebugTarget } from './android.js';
import { createWorker, prepareWorker, DebuggerError, withDebuggerBudget, debuggerRemaining, type DebugWorker, type WorkerEvent } from './worker.js';
type State = 'attaching' | 'running' | 'paused' | 'detaching' | 'detached' | 'disconnected' | 'failed';
interface Session {
    id: string;
    device: string;
    target: DebugTarget | null;
    state: State;
    stop: WorkerEvent | null;
    reason: string | null;
    worker?: DebugWorker;
    port?: number;
    queue: Promise<unknown>;
    events: SessionEvent[];
    sequence: number;
    cleanup: {
        status: 'pending' | 'complete' | 'failed';
        remaining_resources: string[];
    };
    terminalAt?: number;
    created: number;
    activity: number;
    pausedAt?: number;
    timer?: ReturnType<typeof setInterval>;
    cleaning?: Promise<void>;
}
interface SessionEvent extends WorkerEvent {
    sequence: number;
    received_at_ms: number;
}
type CommandArgs = Record<string, unknown> & {
    afterSequence?: number;
    signal?: AbortSignal;
    stopId?: string;
};
interface ResultPayload {
    success?: boolean;
    error?: {
        code: string | null;
        message: string | null;
        retryable: boolean;
    };
    events?: SessionEvent[];
    next_cursor?: number;
    overflow?: boolean;
    timed_out?: boolean;
    execution_state?: 'unknown';
    breakpoints?: unknown;
    result?: WorkerReply;
}
export const debuggerCapabilities = { attach: true, breakpoints: true, stacks: true, locals: true, step: true, resume: true,
    evaluation: false, mutation: false, coroutines: false, native: false };
const limitations = ['JAVA_KOTLIN_BYTECODE_ONLY', 'DEBUG_METADATA_REQUIRED', 'SHALLOW_LOCALS', 'ALL_THREADS_SUSPEND', 'DEVICE_WIDE_UI_GUARD'];
export function debuggerExpiry(created: number, activity: number, pausedAt: number | undefined, now: number) {
    return pausedAt !== undefined && now - pausedAt >= 60000 ? 'pause_limit' : now - activity >= 300000 ? 'idle_limit' : now - created >= 1800000 ? 'session_limit' : null;
}
export class DebuggerSessions {
    private sessions = new Map<string, Session>();
    private closing = false;
    constructor(private native: DebugNative = new AndroidDebugNative(), private workerFactory = createWorker, private prerequisite = prepareWorker) { }
    private prune() {
        const terminal = [...this.sessions.values()].filter(s => s.terminalAt !== undefined && s.cleanup.status === 'complete');
        for (const s of terminal)
            if (Date.now() - s.terminalAt! >= 600000)
                this.sessions.delete(s.id);
        const remaining = terminal.filter(s => this.sessions.has(s.id));
        for (const s of remaining.slice(0, Math.max(0, remaining.length - 100)))
            this.sessions.delete(s.id);
    }
    private get(id: string) { this.prune(); const s = this.sessions.get(id); if (!s)
        throw new DebuggerError('DEBUGGER_NOT_FOUND'); s.activity = Date.now(); return s; }
    private serial<T>(s: Session, fn: () => Promise<T>) { const out = s.queue.then(fn); s.queue = out.catch(() => { }); return out; }
    private result(s: Session, payload: ResultPayload = {}) {
        const success = payload.success ?? (!['failed', 'disconnected'].includes(s.state) && s.cleanup.status !== 'failed');
        const code = s.cleanup.status === 'failed' ? 'DEBUGGER_CLEANUP_FAILED' : s.state === 'disconnected' ? 'DEBUGGER_DISCONNECTED' : s.reason?.match(/^[A-Z_]+$/) ? s.reason : 'DEBUGGER_WORKER_FAILED';
        return structuredClone({ success, ...(!success ? { error: { code, message: code, retryable: false } } : {}), debug_session_id: s.id,
            device: { platform: 'android', id: s.device }, target: s.target, state: s.state, captured_at_ms: Date.now(),
            capabilities: debuggerCapabilities, limitations, cleanup: s.cleanup, reason: s.reason, stop: s.stop, ...payload });
    }
    summary(id: string) { return this.result(this.get(id)); }
    hasActiveSessions() { return [...this.sessions.values()].some(s => s.cleanup.status !== 'complete'); }
    paused(device: string) { const s = [...this.sessions.values()].find(s => s.device === device && s.state === 'paused'); return s ? this.result(s) : null; }
    assertRunning(device: string) { if (this.paused(device))
        throw new DebuggerError('DEBUGGER_PAUSED'); }
    private event(s: Session, event: WorkerEvent) {
        if (s.cleanup.status === 'complete')
            return;
        if (event.event === 'stopped' && !s.cleaning) {
            s.state = 'paused';
            s.stop = event;
            s.pausedAt ??= Date.now();
        }
        if (event.event === 'terminated' || event.event === 'worker_failed') {
            if (!s.cleaning && s.state !== 'failed')
                s.reason = event.reason ?? 'worker_failed';
            if (!s.cleaning) {
                s.state = event.event === 'worker_failed' ? 'failed' : event.reason === 'process_exit' || event.reason === 'transport_lost' ? 'disconnected' : 'detached';
                s.stop = null;
                // The worker has disposed or lost its transport. Cleanup remains pending until host resources are checked.
                void this.serial(s, () => this.cleanup(s, false));
            }
        }
        s.events.push({ ...event, sequence: ++s.sequence, received_at_ms: Date.now() });
        if (s.events.length > 256)
            s.events.shift();
    }
    async capabilities(device: string, app: string, pid?: number) {
        const prerequisites: Record<string, boolean> = { jdk: false, device: false, process: false };
        let candidates: DebugTarget[] = [];
        const reasons: string[] = [];
        try {
            await this.prerequisite();
            prerequisites.jdk = true;
        }
        catch (e) {
            if (e instanceof DebuggerError && ['DEBUGGER_TIMEOUT', 'DEBUGGER_CANCELLED'].includes(e.code))
                throw e;
            reasons.push('DEBUGGER_UNSUPPORTED');
        }
        try {
            candidates = await this.native.candidates(device, app);
            prerequisites.device = true;
            prerequisites.process = candidates.some(t => pid === undefined || pid === t.pid);
            if (!prerequisites.process)
                reasons.push('PROCESS_NOT_FOUND');
        }
        catch (e) {
            if (e instanceof DebuggerError && ['DEBUGGER_TIMEOUT', 'DEBUGGER_CANCELLED'].includes(e.code))
                throw e;
            reasons.push(e instanceof DebuggerError ? e.code : 'DEVICE_UNAVAILABLE');
        }
        return { success: true, debug_session_id: null, device: { platform: 'android', id: device }, target: null, state: null,
            captured_at_ms: Date.now(), supported: Object.values(prerequisites).every(Boolean), prerequisites, candidates,
            capabilities: debuggerCapabilities, reasons, limitations, cleanup: { status: 'complete', remaining_resources: [] } };
    }
    async attach(device: string, app: string, pid?: number, timeout = 10000) {
        this.prune();
        const owned = [...this.sessions.values()].filter(s => s.cleanup.status !== 'complete');
        if (this.closing || owned.length >= 4 || owned.some(s => s.device === device))
            throw new DebuggerError('DEBUGGER_BUSY');
        const s: Session = { id: randomUUID(), device, target: null, state: 'attaching', stop: null, reason: null,
            queue: Promise.resolve(), events: [], sequence: 0, cleanup: { status: 'pending', remaining_resources: [] }, created: Date.now(), activity: Date.now() };
        this.sessions.set(s.id, s);
        return this.serial(s, async () => {
            const deadline = Date.now() + timeout;
            const remaining = () => { debuggerRemaining(timeout); const ms = deadline - Date.now(); if (ms <= 0)
                throw new DebuggerError('DEBUGGER_TIMEOUT'); return ms; };
            try {
                await this.prerequisite();
                remaining();
                const candidates = (await this.native.candidates(device, app)).filter(t => pid === undefined || t.pid === pid);
                remaining();
                if (!candidates.length)
                    throw new DebuggerError('PROCESS_NOT_FOUND');
                if (candidates.length > 1)
                    throw new DebuggerError('PROCESS_AMBIGUOUS');
                s.target = candidates[0];
                s.port = await this.native.forward(device, s.target.pid);
                remaining();
                s.cleanup.remaining_resources.push(`forward:tcp:${s.port}`);
                s.worker = await this.workerFactory(event => this.event(s, event));
                remaining();
                s.cleanup.remaining_resources.push('jdi_worker');
                await s.worker.call('attach', { port: s.port, timeoutMs: remaining() }, remaining());
                await this.native.identity(device, s.target);
                remaining();
                if (s.state === 'attaching')
                    s.state = 'running';
                if (['failed', 'disconnected', 'detached'].includes(s.state))
                    throw new DebuggerError('DEBUGGER_ATTACH_FAILED');
                s.timer = setInterval(() => {
                    const now = Date.now();
                    const reason = debuggerExpiry(s.created, s.activity, s.pausedAt, now);
                    if (reason) {
                        s.reason = reason;
                        void this.serial(s, () => this.cleanup(s, true));
                    }
                }, 1000);
                s.timer.unref();
            }
            catch (e) {
                s.state = 'failed';
                s.reason = e instanceof DebuggerError ? e.code : 'DEBUGGER_ATTACH_FAILED';
                await this.cleanup(s, true);
                return this.result(s, { success: false, error: { code: s.reason, message: s.reason, retryable: false } });
            }
            return this.result(s);
        });
    }
    private async cleanup(s: Session, requestDetach: boolean): Promise<void> {
        if (s.cleaning)
            return s.cleaning;
        s.cleaning = withDebuggerBudget(10000, undefined, async () => {
            if (s.timer)
                clearInterval(s.timer);
            const terminal = ['failed', 'disconnected'].includes(s.state) ? s.state : 'detached';
            s.state = 'detaching';
            s.stop = null;
            s.pausedAt = undefined;
            const remaining: string[] = [];
            if (s.worker) {
                if (requestDetach) {
                    try {
                        await s.worker.call('detach', {}, 3000);
                    }
                    catch { /* EOF/transport closure is the fallback; execution remains unknown. */ }
                }
                try {
                    await s.worker.close();
                    s.worker = undefined;
                }
                catch {
                    remaining.push('jdi_worker');
                }
            }
            if (s.port !== undefined && s.target) {
                try {
                    await this.native.removeForward(s.device, s.port, s.target.pid);
                    s.port = undefined;
                }
                catch {
                    remaining.push(`forward:tcp:${s.port}`);
                }
            }
            s.events = [];
            s.cleanup = { status: remaining.length ? 'failed' : 'complete', remaining_resources: remaining };
            s.state = terminal;
            s.terminalAt = Date.now();
        });
        try {
            await s.cleaning;
        }
        finally {
            s.cleaning = undefined;
        }
    }
    async command(id: string, command: string, args: CommandArgs = {}, timeout = 10000) {
        const s = this.get(id);
        if (command === 'events') {
            const deadline = Date.now() + timeout;
            const after = args.afterSequence ?? 0;
            if (after > s.sequence)
                throw new DebuggerError('INVALID_ARGUMENT');
            if (args.signal?.aborted)
                throw new DebuggerError('DEBUGGER_CANCELLED');
            if (s.worker && ['running', 'paused'].includes(s.state))
                await s.worker.call('heartbeat', {}, Math.min(timeout, 1000));
            while (Date.now() < deadline && !s.events.some(e => e.sequence > after) && s.cleanup.status === 'pending') {
                if (args.signal?.aborted)
                    throw new DebuggerError('DEBUGGER_CANCELLED');
                await new Promise(resolve => setTimeout(resolve, Math.min(50, deadline - Date.now())));
            }
            const events = s.events.filter(e => e.sequence > after).slice(0, 100);
            return this.result(s, { events, next_cursor: events.at(-1)?.sequence ?? s.sequence, overflow: after < (s.events[0]?.sequence ?? s.sequence + 1) - 1, timed_out: events.length === 0 });
        }
        return this.serial(s, () => this.executeCommand(s, command, args, timeout));
    }
    private assertCommandTarget(s: Session, command: string, args: CommandArgs) {
        if (!s.worker || ['detaching', 'detached', 'disconnected', 'failed'].includes(s.state))
            throw new DebuggerError('DEBUGGER_DISCONNECTED');
        if (['stack', 'locals', 'step', 'resume'].includes(command)) {
            if (args.stopId !== s.stop?.stop_id)
                throw new DebuggerError('DEBUGGER_STALE_REFERENCE');
            if (s.state !== 'paused')
                throw new DebuggerError('DEBUGGER_NOT_PAUSED');
        }
    }
    private async executeCommand(s: Session, command: string, args: CommandArgs, timeout: number) {
        if (command === 'detach') {
            if (s.cleanup.status !== 'complete')
                await this.cleanup(s, true);
            return this.result(s, { success: s.cleanup.status === 'complete', execution_state: 'unknown' });
        }
        if (command === 'state' && (s.cleanup.status === 'complete' || ['detaching', 'detached', 'disconnected', 'failed'].includes(s.state)))
            return this.result(s);
        this.assertCommandTarget(s, command, args);
        if (command === 'step' || command === 'resume') {
            s.state = 'running';
            s.stop = null;
            s.pausedAt = undefined;
        }
        try {
            const data = await s.worker!.call(command, args, timeout);
            return this.result(s, command === 'state' ? { breakpoints: data.breakpoints } : { result: data });
        }
        catch (e) {
            return this.handleCommandError(s, command, e);
        }
    }
    private async handleCommandError(s: Session, command: string, e: unknown) {
        if (e instanceof DebuggerError && e.code === 'DEBUGGER_DISCONNECTED') {
            s.state = 'disconnected';
            s.reason = 'transport_lost';
            await this.cleanup(s, false);
            if (command === 'state')
                return this.result(s);
        }
        if ((command === 'step' || command === 'resume' || command === 'set' || command === 'remove') && e instanceof DebuggerError && ['DEBUGGER_TIMEOUT', 'DEBUGGER_CANCELLED', 'DEBUGGER_WORKER_FAILED'].includes(e.code)) {
            s.state = 'failed';
            s.reason = e.code;
            await this.cleanup(s, true);
        }
        throw e;
    }
    async shutdown() { this.closing = true; await Promise.allSettled([...this.sessions.values()].filter(s => s.cleanup.status !== 'complete').map(s => this.serial(s, () => this.cleanup(s, true)))); return [...this.sessions.values()].filter(s => s.cleanup.status !== 'complete').map(s => this.result(s)); }
}
export const debuggerSessions = new DebuggerSessions();
registerDebuggerPauseProvider(device => debuggerSessions.paused(device));
