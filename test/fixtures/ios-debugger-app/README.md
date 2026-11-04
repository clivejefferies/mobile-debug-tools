# iOS debugger fixture

Disposable UIKit app for simulator-only LLDB MCP checks. Builds with Xcode's
`swiftc -g -Onone`; no external package or user app is used. Select an explicit
booted simulator:

```sh
npm run build
MCP_IOS_DEBUGGER_DEVICE=<UDID> node --import tsx test/device/automated/debugger/runtime.ios.test.ts
# Include the real 60-second pause expiry:
MCP_IOS_DEBUGGER_DEVICE=<UDID> MCP_IOS_DEBUGGER_EXTENDED=1 node --import tsx test/device/automated/debugger/runtime.ios.test.ts
```

Requires macOS, full Xcode with Swift-enabled LLDB/Python, and working idb UI-tree
reads. The test installs/removes only `dev.mobiledebug.iosfixture`, and cleans its
private temporary build/module-cache directory. It does not boot/shut down devices.
The app's fixture-only `Documents/debugger-command` file invokes the same actions
as its buttons through a main-loop timer. The smoke runner writes only that file
because the installed idb HID backend expects SimulatorKit at a path absent in
this Xcode. This is a fixture trigger, not evidence that MCP tap delivery
succeeded. Paused MCP taps must be rejected before delivery. Completion and
cancellation use fresh MCP UI-tree assertions.

Async work uses a suspended child operation in an actor, known values on either
side of await, a main-actor UI update and a separate cancellation task. Boundary
stepping is recorded independently from source-breakpoint coverage. Stop-scoped
thread/frame IDs do not establish logical task identity.
