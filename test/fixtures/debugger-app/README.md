# Isolated Android debugger fixture

[Contributing](../../../CONTRIBUTING.md) · [Documentation](../../../docs/README.md)

Package `dev.mobiledebugmcp.debugfixture`, built with `android:debuggable=true`
and Java source/line/local metadata. Calculate exposes `known=42`, an increment
call for into/over/out stepping, and a visible `Result 43` after resume. Late class
loads a second class reflectively to check pending source breakpoints. NoLocals
is compiled with source/line tables and no variable tables to verify explicit ART
metadata uncertainty.

Build helper uses SDK platform/build-tools 36, the existing direct javac/D8/aapt2
pattern, ephemeral signing material and temporary output. It does not modify other
apps or display settings. The automated journey installs/removes only this fixture
and checks session-owned ADB forwards. See [debugger tools](../../../docs/tools/debugger.md).

## Interaction regression journey

The same isolated fixture is also used by the [interaction device check](../../device/automated/interact/interaction.android.test.ts)
for clickable waits, stored handles, selector taps, visibility and enabled-state
assertions. Run it after building the server:

```sh
MCP_INTERACTION_DEVICE=emulator-5554 npx tsx test/device/automated/interact/interaction.android.test.ts
```

It also runs in `npm run test:device` when `MCP_INTERACTION_DEVICE` or
`MCP_DEBUGGER_DEVICE` selects a device. Fixture journeys run sequentially and
remove their own package and temporary build outputs. This check does not attach
a debugger or modify another app's data.
