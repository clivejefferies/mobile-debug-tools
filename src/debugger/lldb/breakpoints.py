"""Owned source breakpoints with exact-line checking, including late image loads."""
import os
import uuid
import lldb


class Breakpoints:
    def __init__(self, target):
        self.target = target
        self.owned = {}

    def describe(self, key):
        bp, source, line = self.owned[key]
        locations = []
        rejected = False
        for loc in bp:
            entry = loc.GetAddress().GetLineEntry()
            actual = str(entry.GetFileSpec())
            exact = entry.IsValid() and os.path.normpath(actual) == source and entry.GetLine() == line
            loc.SetEnabled(exact)
            if exact:
                locations.append({"source_file": actual, "line": line})
            else:
                rejected = True
        known_source = self.target.FindCompileUnits(lldb.SBFileSpec(source)).GetSize() > 0
        status = "resolved" if locations else "rejected" if rejected or known_source else "pending"
        return {"breakpoint_id": key, "status": status, "locations": locations}

    def set(self, args):
        source = os.path.normpath(args["sourceFile"])
        bp = self.target.BreakpointCreateByLocation(lldb.SBFileSpec(source), args["line"], 0, 0, lldb.SBFileSpecList(), False)
        key = str(uuid.uuid4())
        self.owned[key] = (bp, source, args["line"])
        result = self.describe(key)
        if result["status"] == "rejected":
            self.target.BreakpointDelete(bp.GetID())
            del self.owned[key]
        return result

    def refresh(self):
        return [self.describe(key) for key in list(self.owned)]

    def remove(self, key):
        if key in self.owned:
            bp, _, _ = self.owned.pop(key)
            self.target.BreakpointDelete(bp.GetID())
        return {"removed": True}

    def clear(self):
        for key in list(self.owned):
            self.remove(key)
