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
