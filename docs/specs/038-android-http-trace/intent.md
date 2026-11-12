# Android emulator HTTP tracing

Status: Scope accepted on 2026-11-11. Clive replied “ok, lets start” to the
Android-only MVP recommendation.

Source: [Issue #85](https://github.com/clivejefferies/mobile-debug-tools/issues/85).

Developers debugging their own Android apps need structured HTTP evidence when
platform logs leave gaps. Add optional MCP tracing for explicitly configured
debug apps on Android emulators. A developer should be able to start a trace,
perform an action in the app, read redacted request and response metadata, and
stop the trace with verified cleanup.

Use app-local proxy and certificate trust configuration. Preserve normal
debugging workflows, release trust configuration, hostname verification, and
application pinning. The MVP covers Android emulators only. Keep response bodies
and headers outside the initial scope.

Verify listener confinement and demonstrate the workflow on a second owned
debug app before calling the MVP ready. Use an owned debug fixture for the
reproducible baseline. Device-wide setup and iOS are outside this scope.
