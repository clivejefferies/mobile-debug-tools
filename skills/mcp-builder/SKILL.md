# MCP Builder skill

name: mcp-builder
version: 0.1.0
summary: Reusable procedures for building, validating and installing Android/iOS apps in this repo. Designed for agents to act autonomously with project-specific guidance.

# Purpose
Provide concise, actionable procedures and schemas that encode the successful sequences used in mobile-debug-mcp: toolchain detection, build orchestration, install fallbacks, diagnostics collection, and verification (lint/tests). Keep core guidance short; link to references for details.

# Activation conditions
Activate when an agent needs to:
- build or install an app from this repository
- diagnose failing CI/dev machine builds
- run lint/tests and collect reproducible diagnostics

# Surface area (actions)
- detect-toolchain
- build-android
- install-android
- build-ios
- install-ios
- run-lint
- run-tests
- collect-diagnostics

# Core guidance (what agent must do)
1. Prefer project conventions and existing helpers in src/utils and src/manage.
2. Use detect-toolchain to decide JAVA_HOME/JBR preference and whether adb/idb/xcrun are available.
3. For Android builds, call prepareGradle() to prepare child PATH and env, then run ./gradlew (wrapper) if present.
4. For installs, parse adb output defensively (ignore streamed-install noise) and on failure fall back to push+pm path.
5. For iOS installs, prefer simctl for simulators; if simctl fails check idb and attempt idb install with diagnostics.
6. On any error, call collect-diagnostics and attach env snapshot, invoked commands, stdout/stderr, and suggested fixes.

# Inputs & outputs (short schemas)
- detect-toolchain(input: { platform: 'android'|'ios'|'both', preferJBR?: boolean }) -> { tools: [{name, cmd, ok, version, suggestion}] }
- build-android(input: { projectPath, variant?, clean?, envOverrides? }) -> { success, artifactPath?, logs?, diagnostics? }
- install-android(input: { appPath, projectPath?, deviceId?, allowBuild? }) -> { installed:boolean, device, output?, diagnostics? }
- build-ios/install-ios: mirror Android schema but use scheme/workspace/project and resultBundlePath
- run-lint/run-tests -> { exitCode, stdout, stderr, artifacts[] }
- collect-diagnostics(input: { reason, platform? }) -> { artifacts: [{ name, contentBase64?, path? }], envSnapshot }

# Failure handling & suggestions
- Always return structured diagnostics instead of throwing when possible.
- Provide a short human-friendly suggestion in diagnostics (e.g., "Install Android Platform Tools or set ADB_PATH").
- Redact sensitive env values (tokens, credentials) when including envSnapshot.

# Progressive disclosure
- Keep SKILL.md compact (this file). Place heavy references in skills/mcp-builder/references/*.md and instruct agents to load them only when needed.

# References (implement as separate files)
- references/toolchain-details.md — exact paths/heuristics used for JBR, JAVA_HOME, ANDROID_SDK locations.
- references/build-flags.md — gradle/xcodebuild flags used, timeouts, and retry rationale.
- references/diagnostics-schema.md — JSON schema for runResult and collected artifacts.

# Implementation notes for maintainers
- Implement a thin adapter in src/skills/mcp-builder/index.ts that maps skill actions to existing functions in src/manage and src/utils.
- Provide unit tests under test/skills/mcp-builder that mock child_process to validate happy/failure paths.
- Add env toggles: MCP_PREFERS_JBR, MCP_GRADLE_RETRIES, MCP_XCODEBUILD_RETRIES.

# Example agent flow
1. call detect-toolchain({platform:'android', preferJBR:true})
2. if ok -> call build-android({projectPath:'/path', variant:'Debug'})
3. call install-android({appPath:'/path/to.apk', deviceId:'emulator-5554'})
4. if install fails -> call collect-diagnostics({reason:'install failure', platform:'android'})

# License
Same as repository (MIT).

