"""Platform-independent regression checks for the optional LLDB worker."""
import pathlib
import sys
import types

root = pathlib.Path(__file__).resolve().parents[3] / 'src/debugger/lldb'
sys.path.insert(0, str(root))
lldb = types.SimpleNamespace(eStateInvalid=0, eStateStopped=5, eStateExited=10, eStateDetached=9,
                            eStopReasonNone=1, eStopReasonInvalid=0, eStopReasonBreakpoint=3)
sys.modules['lldb'] = lldb
import worker
from inspection import Inspection
from breakpoints import Breakpoints

# Independent pause, idle and absolute expiry cannot be extended by heartbeats.
w = object.__new__(worker.Worker)
clock = [100.0]
worker.time.monotonic = lambda: clock[0]
w.created, w.activity, w.paused_at = 0, 100, 40
assert w.expired() == 'pause_limit'
w.paused_at = None
clock[0] = 400
assert w.expired() == 'idle_limit'
w.activity = 1800
clock[0] = 1800
assert w.expired() == 'session_limit'

# An internal transition with an empty thread list must not create a pause epoch.
i = Inspection()
p = types.SimpleNamespace(GetNumThreads=lambda: 0, GetState=lambda: 5, GetSelectedThread=lambda: types.SimpleNamespace(IsValid=lambda: False))
assert i.stopped(p) is None
assert i.stop_id is None
for method, args in [(i.thread, {'stopId': 'old', 'threadId': 'old'}),
                     (i.locals, {'stopId': 'old', 'frameId': 'old'})]:
    try:
        method(args)
        raise AssertionError('Stale reference accepted')
    except ValueError as error:
        assert str(error) == 'DEBUGGER_STALE_REFERENCE'

# Exact source-line resolver must never request nearest-code relocation.
class Entry:
    def IsValid(self): return True
    def GetFileSpec(self): return '/tmp/App.swift'
    def GetLine(self): return 13
class Location:
    def GetAddress(self): return types.SimpleNamespace(GetLineEntry=lambda: Entry())
    def SetEnabled(self, enabled): self.enabled = enabled
class Breakpoint:
    def __init__(self): self.location = Location()
    def __iter__(self): return iter([self.location])
    def GetID(self): return 1
class Target:
    def __init__(self): self.deleted = False; self.bp = Breakpoint()
    def BreakpointCreateByLocation(self, *args):
        assert args[-1] is False
        return self.bp
    def BreakpointDelete(self, identity): self.deleted = True
    def FindCompileUnits(self, source): return types.SimpleNamespace(GetSize=lambda: 1)
lldb.SBFileSpec = lambda source: source
lldb.SBFileSpecList = list
t = Target()
b = Breakpoints(t)
r = b.set({'sourceFile': '/tmp/App.swift', 'line': 12})
assert r['status'] == 'rejected'
assert t.bp.location.enabled is False and t.deleted

# Polling must consume events before reading the process snapshot.
trace = []
class Listener:
    def GetNextEvent(self, event): trace.append('consume'); return False
class Process:
    def GetState(self): trace.append('state'); return 6
w.debugger = types.SimpleNamespace(GetListener=lambda: Listener())
w.process, w.terminal = Process(), False
lldb.SBEvent = object
w.poll()
assert trace == ['consume', 'state']

# EOF cleanup must release an actual target, never call Kill or expression APIs.
w.attached = True
w.inspection = Inspection()
w.breakpoints = types.SimpleNamespace(clear=lambda: None)
w.process = types.SimpleNamespace(IsValid=lambda: True, GetState=lambda: 5,
    Detach=lambda: types.SimpleNamespace(Success=lambda: True))
assert w.detach() == {'detached': True}
assert w.terminal
print('PASS LLDB worker expiry, transient stops, stale references, exact lines, events and detach')

# Static Swift bool decoding must preserve boolean meaning without formatters.
lldb.eNoDynamicValues, lldb.eTypeIsScalar, lldb.eTypeIsInteger, lldb.eTypeIsFloat = 0, 1, 2, 4
class BoolValue:
    def GetNonSyntheticValue(self): return self
    def GetName(self): return 'cancelled'
    def GetTypeName(self): return 'Swift.Bool'
    def GetError(self): return types.SimpleNamespace(Success=lambda: True)
    def GetType(self): return types.SimpleNamespace(GetTypeFlags=lambda: 0)
    def GetValue(self): return '1'
    def GetChildMemberWithName(self, name):
        assert name == '_value'
        return types.SimpleNamespace(GetNonSyntheticValue=lambda: self)
    def IsValid(self): return True
values = types.SimpleNamespace(GetSize=lambda: 1, GetValueAtIndex=lambda index: BoolValue())
i.stop_id = '00000000-0000-0000-0000-000000000001'
i.frames['frame'] = types.SimpleNamespace(GetVariables=lambda *args: values)
assert i.locals({'stopId': i.stop_id, 'frameId': 'frame'})['locals'][0]['value'] == 'true'

# Reference summaries are stable within a stop and never expose the pointer.
pointer = types.SimpleNamespace(GetValue=lambda: '0x1234')
first = i.object_identity(pointer, 'Controller')
assert first == i.object_identity(pointer, 'Controller') and '1234' not in first
i.stop_id = '00000000-0000-0000-0000-000000000002'
assert first != i.object_identity(pointer, 'Controller')

# Repeated stack pages reuse references and cannot grow beyond the stop cap.
import inspection
original_location = inspection.location
inspection.location = lambda frame: {'source_file': '/tmp/App.swift', 'line': 1}
try:
    i.invalidate()
    i.stop_id = '00000000-0000-0000-0000-000000000001'
    i.threads['thread'] = types.SimpleNamespace(GetNumFrames=lambda: 1001, GetFrameAtIndex=lambda index: object())
    args = {'stopId': i.stop_id, 'threadId': 'thread', 'limit': 100}
    assert i.stack(args)['frames'][0]['frame_id'] == i.stack(args)['frames'][0]['frame_id']
    for offset in range(0, 1000, 100): i.stack({**args, 'offset': offset})
    assert len(i.frames) == 1000
    i.threads['other'] = i.threads['thread']
    result = i.stack({**args, 'threadId': 'other'})
    assert result['frames'] == [] and result['truncated']
finally:
    inspection.location = original_location
print('PASS static bool decoding, opaque identities and bounded stable frame references')

# Error-reporting StepInto requires LLDB's UINT32_MAX sentinel, not line zero.
lldb.LLDB_INVALID_LINE_NUMBER, lldb.eOnlyDuringStepping = 4294967295, 0
lldb.SBError = lambda: types.SimpleNamespace(Success=lambda: True)
class StepThread:
    def StepInto(self, target, end_line, error, run_mode):
        assert target is None and end_line == 4294967295
w.terminal = False
w.inspection = Inspection()
w.inspection.stop_id = 'stop'
w.inspection.threads['thread'] = StepThread()
w.process = types.SimpleNamespace(GetState=lambda: 5)
assert w.command({'command': 'step', 'stopId': 'stop', 'threadId': 'thread', 'kind': 'into'}) == {'resumed': True}
assert w.inspection.stop_id is None
print('PASS LLDB step error overload uses the documented invalid-line sentinel')

# Signals and exceptions must not be misrepresented as completed source steps.
lldb.eStopReasonPlanComplete, lldb.eStopReasonSignal, lldb.eStopReasonException = 8, 5, 6
lldb.eStopReasonWatchpoint, lldb.eStopReasonExec = 4, 7
assert inspection.stop_reason(types.SimpleNamespace(GetStopReason=lambda: 5)) == 'signal'
assert inspection.stop_reason(types.SimpleNamespace(GetStopReason=lambda: 6)) == 'exception'
assert inspection.stop_reason(types.SimpleNamespace(GetStopReason=lambda: 8)) == 'step'
assert inspection.stop_reason(types.SimpleNamespace(GetStopReason=lambda: 99)) == 'unknown'
print('PASS LLDB stop reasons preserve signal/exception versus step evidence')

# Losing a previously owned process handle cannot prove detach or resume.
w.attached = True
w.process = types.SimpleNamespace(IsValid=lambda: False)
try:
    w.detach()
    raise AssertionError('Lost process handle incorrectly confirmed detach')
except ValueError as error:
    assert str(error) == 'DEBUGGER_WORKER_FAILED'
print('PASS lost process handles preserve cleanup uncertainty')
