# Intent: trustworthy app installation status

Status: intent approved; specification pending.
Originator: GitHub issue #98; author identity not independently checked.
Captured: 2026-11-05.
Source: https://github.com/clivejefferies/mobile-debug-tools/issues/98

## Problem

Agent feedback reported `appInstalled: false` while Modul8 was installed and
running. The original device, app context and query are not yet established.
Current code can represent missing app context or failed installation queries
as absence; Android system status also queries without explicit device targeting.
These findings explain possible failure paths, not a reproduction of the report.

## Desired outcome and scope

Make installation reporting trustworthy for MCP clients using device inventory
and system status on Android and iOS. Distinguish confirmed installed, confirmed
absent and unknown/check-failed results, with explicit app and device context
and the scope of the check. Review device selection consumers so unknown status
cannot be mistaken for confirmed absence or used as unsupported targeting evidence.

Success includes meaningful coverage for installed/running and absent apps,
missing app context, multiple devices and failed queries. Reproduce the original
inconsistency where practical, otherwise document the evidence and limits.
Align tool descriptions and diagnostics with the accepted contract.

## Constraints and open questions

Preserve existing compatibility where possible; any response-contract change
requires specification approval. Use bounded, device-specific queries and avoid
installing, removing or launching user apps merely to check installation.
Automatic installation, broader readiness changes and expanded platform support
are excluded. Investigation will establish reliable absence evidence on each
supported platform and how legacy `appInstalled` maps to unknown results.

## Approval

The user approved the captured intent with “yes” in this chat on 2026-11-05.
This approves the problem and scope; response contracts await specification approval.
