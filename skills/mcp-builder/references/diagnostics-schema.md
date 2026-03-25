# Diagnostics schema

This document defines the JSON shapes that mcp-builder actions return when collecting diagnostics. Agents and tooling should rely on these keys.

Top-level diagnostic object
{
  "error": "short human-friendly message",
  "runResult": {
    "command": "/usr/bin/adb",
    "args": ["install", "app.apk"],
    "exitCode": 1,
    "stdout": "...",
    "stderr": "...",
    "startTimeMs": 1650000000000,
    "endTimeMs": 1650000001000,
    "envSnapshot": { "PATH": "...", "JAVA_HOME": "REDACTED" }
  },
  "artifacts": [ { name, path?, contentBase64?, type? } ],
  "suggestedFixes": ["Install Android Platform Tools", "Set JAVA_HOME to JDK 17"]
}

Fields
- error: short message summarising the failure.
- runResult: information captured from a single command invocation. Use this for programmatic retries or human debugging.
  - command, args: the executed command
  - exitCode: numeric exit code, null for killed/unknown
  - stdout, stderr: captured text
  - startTimeMs, endTimeMs: epoch ms for duration
  - envSnapshot: a restricted set of env variables (PATH, JAVA_HOME, ADB_PATH, IDB_PATH, XCRUN_PATH). Any value matching sensitive patterns (e.g., /token|secret|key|passwd/i) must be redacted to "REDACTED".
- artifacts: array of captured files. Each artifact: { name: string, path?: string, contentBase64?: string, type?: "log"|"archive"|"image" }
- suggestedFixes: short actionable suggestions for human/operator.

Notes on size and transmission
- Prefer storing large artifacts on disk and returning paths rather than inlining large base64 blobs. If transmitting, limit base64 inlined artifacts to a configurable max (e.g., 5MB) and prefer compression/archiving.

Example: adb install failure
{
  "error": "adb: device not found",
  "runResult": {
    "command": "adb",
    "args": ["devices"],
    "exitCode": 0,
    "stdout": "List of devices attached\n\n",
    "stderr": "",
    "envSnapshot": { "PATH": "/usr/local/bin:/usr/bin", "JAVA_HOME": null }
  },
  "suggestedFixes": ["Connect an Android device or start an emulator", "Ensure adb is on PATH or set ADB_PATH"]
}
