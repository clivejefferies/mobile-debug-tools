"""Private JSON worker for simulator LLDB. Stdout is exclusively bounded IPC."""
import json
import os
import queue
import sys
import threading
import time
import lldb
from inspection import Inspection
from breakpoints import Breakpoints

requests = queue.Queue(maxsize=64)
output_lock = threading.Lock()


def send(value):
    data = json.dumps(value, separators=(",", ":"))
    if len(data.encode()) > 1024 * 1024:
        raise ValueError("DEBUGGER_WORKER_FAILED")
    with output_lock:
        sys.stdout.write(data + "\n")
        sys.stdout.flush()


def read_input():
    try:
        while True:
            line = sys.stdin.buffer.readline(1024 * 1024 + 1)
            if not line:
                break
            if len(line) > 1024 * 1024:
                break
            requests.put(json.loads(line), timeout=1)
    except Exception:
        pass
    finally:
        # EOF must remain observable even when the queue was filled by a dead parent.
        eof.set()


eof = threading.Event()


class Worker:
    def __init__(self):
        self.debugger = lldb.SBDebugger.Create(False)
        self.debugger.SetAsync(True)
        self.debugger.SetUseColor(False)
        lldb.SBDebugger.SetInternalVariable("target.load-script-from-symbol-file", "false", self.debugger.GetInstanceName())
        self.output = open(os.devnull, "w")
        self.debugger.SetOutputFileHandle(self.output, False)
        self.debugger.SetErrorFileHandle(self.output, False)
        self.process = None
        self.attached = False
        self.breakpoints = None
        self.inspection = Inspection()
        self.created = self.activity = time.monotonic()
        self.paused_at = None
        self.last_stop = 0
        self.terminal = False

    def attach(self, args):
        self.debugger.SetAsync(False)
        target = self.debugger.CreateTarget(args["executablePath"])
        if not target.IsValid():
            raise ValueError("DEBUGGER_WORKER_FAILED")
        self.breakpoints = Breakpoints(target)
        error = lldb.SBError()
        self.process = target.AttachToProcessWithID(self.debugger.GetListener(), args["pid"], error)
        self.debugger.SetAsync(True)
        self.attached = self.process.IsValid()
        if not error.Success() or not self.process.IsValid():
            raise ValueError("DEBUGGER_WORKER_FAILED")
        actual = self.process.GetProcessInfo().GetExecutableFile()
        if not actual.IsValid() or os.path.realpath(str(actual)) != os.path.realpath(args["executablePath"]):
            self.process.Detach()
            raise ValueError("DEBUGGER_WORKER_FAILED")
        self.last_stop = self.process.GetStopID()
        if not self.process.Continue().Success():
            raise ValueError("DEBUGGER_WORKER_FAILED")
        return {"attached": True}

    def detach(self):
        self.inspection.invalidate()
        if self.breakpoints:
            self.breakpoints.clear()
        if self.attached:
            if not self.process.IsValid():
                raise ValueError("DEBUGGER_WORKER_FAILED")
            if self.process.GetState() not in (lldb.eStateExited, lldb.eStateDetached):
                error = self.process.Detach()
                if not error.Success():
                    raise ValueError("DEBUGGER_WORKER_FAILED")
            self.attached = False
        self.terminal = True
        return {"detached": True}

    def poll(self):
        # Removing process events updates LLDB's public state/thread snapshot.
        # Polling GetState alone can leave the initial attach stop cached.
        for _ in range(32):
            event = lldb.SBEvent()
            if not self.debugger.GetListener().GetNextEvent(event):
                break
            if lldb.SBProcess.EventIsProcessEvent(event):
                lldb.SBProcess.GetStateFromEvent(event)
        if not self.process or self.terminal:
            return
        state = self.process.GetState()
        if state in (lldb.eStateExited, lldb.eStateDetached):
            self.inspection.invalidate()
            self.terminal = True
            send({"event": "terminated", "reason": "process_exit" if state == lldb.eStateExited else "detached"})
        elif state == lldb.eStateStopped and self.process.GetStopID() != self.last_stop:
            self.breakpoints.refresh()
            event = self.inspection.stopped(self.process)
            if event:
                self.last_stop = self.process.GetStopID()
                self.paused_at = time.monotonic()
                send(event)

    def command(self, args):
        command = args["command"]
        if command == "attach":
            return self.attach(args)
        if command == "detach":
            return self.detach()
        if not self.process or self.terminal:
            raise ValueError("DEBUGGER_DISCONNECTED")
        if command in ("heartbeat", "state"):
            return {"breakpoints": self.breakpoints.refresh()}
        if command == "set":
            return self.breakpoints.set(args)
        if command == "remove":
            return self.breakpoints.remove(args["breakpointId"])
        if command in ("stack", "locals", "step", "resume"):
            if args.get("stopId") != self.inspection.stop_id:
                raise ValueError("DEBUGGER_STALE_REFERENCE")
            if self.process.GetState() != lldb.eStateStopped:
                raise ValueError("DEBUGGER_NOT_PAUSED")
        if command == "stack":
            return self.inspection.stack(args)
        if command == "locals":
            return self.inspection.locals(args)
        if command in ("step", "resume"):
            thread = self.inspection.thread(args) if command == "step" else None
            self.inspection.invalidate()
            self.paused_at = None
            if command == "resume":
                if not self.process.Continue().Success():
                    raise ValueError("DEBUGGER_WORKER_FAILED")
            else:
                error = lldb.SBError()
                if args["kind"] == "into":
                    thread.StepInto(None, lldb.LLDB_INVALID_LINE_NUMBER, error, lldb.eOnlyDuringStepping)
                elif args["kind"] == "over":
                    thread.StepOver(lldb.eOnlyDuringStepping, error)
                else:
                    thread.StepOut(error)
                if not error.Success():
                    raise ValueError("DEBUGGER_WORKER_FAILED")
            return {"resumed": True}
        raise ValueError("INVALID_ARGUMENT")

    def expired(self):
        now = time.monotonic()
        return ("pause_limit" if self.paused_at and now - self.paused_at >= 60 else
                "idle_limit" if now - self.activity >= 300 else
                "session_limit" if now - self.created >= 1800 else None)


def main():
    worker = Worker()
    threading.Thread(target=read_input, daemon=True).start()
    try:
        while not eof.is_set():
            worker.poll()
            reason = worker.expired()
            if reason:
                worker.detach()
                send({"event": "terminated", "reason": reason})
                break
            try:
                args = requests.get(timeout=0.02)
            except queue.Empty:
                continue
            worker.activity = time.monotonic()
            try:
                result = worker.command(args)
                send({"id": args["id"], "result": result})
            except Exception as error:
                allowed = {"INVALID_ARGUMENT", "DEBUGGER_NOT_PAUSED", "DEBUGGER_STALE_REFERENCE", "DEBUGGER_DISCONNECTED"}
                code = str(error) if isinstance(error, ValueError) and str(error) in allowed else "DEBUGGER_WORKER_FAILED"
                send({"id": args["id"], "error": {"code": code}})
    finally:
        try:
            worker.detach()
        finally:
            lldb.SBDebugger.Destroy(worker.debugger)


if __name__ == "__main__":
    main()
