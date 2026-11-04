"""Bounded, static inspection. Never evaluate expressions or object descriptions."""
import uuid
import re
import lldb


def location(frame):
    entry = frame.GetLineEntry()
    file = entry.GetFileSpec()
    source = str(file)[:512] if file.IsValid() else None
    return {"source_file": source, "line": entry.GetLine() if entry.IsValid() else None,
            "method_name": (frame.GetFunctionName() or "")[:512], "class_name": None}


class Inspection:
    def __init__(self):
        self.invalidate()

    def invalidate(self):
        self.stop_id = None
        self.threads = {}
        self.frames = {}

    def stopped(self, process):
        self.invalidate()
        self.stop_id = str(uuid.uuid4())
        selected = None
        chosen = process.GetSelectedThread()
        threads = [chosen] if chosen.IsValid() else []
        for index in range(min(process.GetNumThreads(), 100)):
            thread = process.GetThreadAtIndex(index)
            if not chosen.IsValid() or thread.GetThreadID() != chosen.GetThreadID():
                threads.append(thread)
        for thread in threads[:100]:
            key = str(uuid.uuid4())
            self.threads[key] = thread
            if selected is None and thread.GetStopReason() not in (lldb.eStopReasonNone, lldb.eStopReasonInvalid):
                selected = key
        if selected is None or process.GetState() != lldb.eStateStopped:
            self.invalidate()
            return None
        thread = self.threads.get(selected)
        return {"event": "stopped", "stop_id": self.stop_id, "thread_id": selected,
                "reason": stop_reason(thread),
                "location": location(thread.GetFrameAtIndex(0)) if thread else None,
                "threads": [{"thread_id": key, "name": (t.GetName() or "")[:256]} for key, t in self.threads.items()],
                "threads_truncated": process.GetNumThreads() > 100}

    def thread(self, args):
        if args.get("stopId") != self.stop_id or args.get("threadId") not in self.threads:
            raise ValueError("DEBUGGER_STALE_REFERENCE")
        return self.threads[args["threadId"]]

    def stack(self, args):
        thread = self.thread(args)
        offset, limit = args.get("offset", 0), args.get("limit", 20)
        count = min(thread.GetNumFrames(), 1000)
        frames = []
        for index in range(offset, min(count, offset + limit)):
            frame = thread.GetFrameAtIndex(index)
            key = self.stop_id + ":" + args["threadId"] + ":" + str(index)
            if key not in self.frames and len(self.frames) >= 1000:
                break
            self.frames[key] = frame
            frames.append({"frame_id": key, "index": index, **location(frame)})
        return {"frames": frames, "truncated": count > offset + len(frames) or thread.GetNumFrames() > 1000}

    def locals(self, args):
        if args.get("stopId") != self.stop_id or args.get("frameId") not in self.frames:
            raise ValueError("DEBUGGER_STALE_REFERENCE")
        frame = self.frames[args["frameId"]]
        values = frame.GetVariables(True, True, False, True, lldb.eNoDynamicValues)
        result = []
        for index in range(min(values.GetSize(), 100)):
            value = values.GetValueAtIndex(index).GetNonSyntheticValue()
            name, kind = (value.GetName() or "")[:256], (value.GetTypeName() or "")[:256]
            if not value.GetError().Success():
                result.append({"name": name, "type": kind, "availability": "unavailable"})
                continue
            primitive = value.GetType().GetTypeFlags() & (lldb.eTypeIsScalar | lldb.eTypeIsInteger | lldb.eTypeIsFloat)
            text = value.GetValue() if primitive else None
            # Swift value wrappers are not C scalars. Decode only standard primitive storage.
            if kind in ("Swift.Int", "Swift.Int32", "Swift.Int64", "Swift.UInt", "Swift.Bool", "Swift.Double", "Swift.Float"):
                storage = value.GetChildMemberWithName("_value").GetNonSyntheticValue()
                if storage.IsValid() and storage.GetError().Success():
                    text = storage.GetValue()
            if kind == "Swift.Bool" and text in ("0", "1"):
                text = "true" if text == "1" else "false"
            result.append({"name": name, "type": kind, "value": text[:256] if text else None,
                           "kind": "primitive" if text is not None else "object",
                           "truncated": bool(text and len(text) > 256),
                           "object_id": self.object_identity(value, kind) if text is None else None})
        return {"availability": "available" if result else "unknown", "locals": result,
                "reason": None if result else "EMPTY_OR_UNAVAILABLE_VARIABLE_METADATA",
                "truncated": values.GetSize() > 100}

    def object_identity(self, value, kind):
        pointer = value.GetValue()
        if pointer and re.fullmatch(r"0x[0-9a-fA-F]+", pointer):
            return str(uuid.uuid5(uuid.UUID(self.stop_id), kind + ":" + pointer))
        return None


def stop_reason(thread):
    if thread is None:
        return "unknown"
    return {lldb.eStopReasonBreakpoint: "breakpoint", lldb.eStopReasonPlanComplete: "step",
            lldb.eStopReasonSignal: "signal", lldb.eStopReasonException: "exception",
            lldb.eStopReasonWatchpoint: "watchpoint", lldb.eStopReasonExec: "exec"}.get(thread.GetStopReason(), "unknown")
