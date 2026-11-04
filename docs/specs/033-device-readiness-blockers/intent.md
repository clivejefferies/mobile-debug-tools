# Intent: device readiness blockers

Status: intent and revised specification approved; implementation authorised.
Originator: clivejefferies, GitHub issue #101, created 2026-11-04.
Captured: 2026-11-04.
Source: https://github.com/clivejefferies/mobile-debug-tools/issues/101

## Problem

Recent agent feedback reports that a successful app launch left the agent
inspecting a sleeping or locked phone. Existing app readiness signals (#65)
need to distinguish launch dispatch from an app observed to be visible and
ready for input.

## Desired outcome and scope

Extend existing launch, readiness, and relevant interaction results so MCP
clients can identify device-level readiness blockers on Android and iOS.
Report sleeping or locked states only when supported evidence establishes
them; otherwise expose explicit unknown or unsupported outcomes. Include
evidence timestamps and coordinate with existing debugger-paused reporting.

Success means launch dispatch alone cannot imply visibility or input readiness,
and supported awake/unlocked, sleeping, locked, transitioning, and debugger-paused
flows have recorded verification. Distinguish Android and iOS evidence and record
any inaccessible scenarios. Reproduce the reported flow where practical.

## Constraints and questions

Preserve bounded waits, device targeting, and existing action contracts unless a
compatibility change is explicitly approved. Do not automatically unlock devices
or change security settings. New diagnostic capabilities are outside scope.

Investigation must establish which device states each platform can reliably
observe, which existing results need the evidence, and how stale or conflicting
observations should be represented. These decisions belong in the specification.

## Approval

User approved this problem and scope with “ok” in the current chat on 2026-11-04,
in response to the captured intent and explicit intent-approval question.
