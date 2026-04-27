# RFC Review skill

name: rfc-review
version: 0.1.1
summary: Reusable workflow for reviewing RFCs/specs in this repository with a consistent readiness rubric and output template.

# Purpose
Help an agent review an RFC for clarity, implementation readiness, and alignment with the current codebase. Use a common template so reviews stay consistent across documents and reviewers.

# Activation conditions
Activate when an agent needs to:
- review a new or revised RFC
- assess whether an RFC is implementation-ready
- identify whether feedback is an RFC issue or an implementation issue
- compare a spec against the current `src/` contract surface and docs

# Surface area (actions)
- locate-rfc
- compare-against-code
- assess-contract-completeness
- classify-gaps
- produce-review

# Core guidance
1. Read the RFC first, then compare it against the relevant code, docs, and tests.
2. Separate **spec gaps** from **implementation gaps**.
3. Check for: problem clarity, scope boundaries, explicit contracts, acceptance criteria, non-goals, and consistency with existing behavior.
4. Prefer precise feedback that names the missing contract, unclear rule, or inconsistent behavior.
5. Use the shared review template in `references/rfc-review-template.md` for the final output.
6. If the RFC is not ready, say exactly what must be clarified before implementation can start.
7. Classify each blocker as either a **spec gap** or an **implementation contract gap** and stop at that boundary.

# Inputs & outputs
- review-rfc(input: { rfcPath, relatedPaths?, focusAreas? }) -> { verdict, risks, specGaps, implementationGaps, recommendations }
- compare-against-code(input: { rfcPath, codePaths[] }) -> { matches, mismatches, notes }
- produce-review(input: { rfcPath, findings[] }) -> { summary, verdict, checklist, nextStep }

# Failure handling
- If the RFC file is missing, stop and report the missing path explicitly.
- If the RFC is ambiguous, classify each concern as either "spec" or "implementation" instead of blending them.
- If the review cannot be grounded in the current repo, state that the RFC is not reviewable yet.

# Progressive disclosure
- Keep this file short.
- Load the reference template only when writing the final review.

# References
- `references/rfc-review-template.md` — standard review format and verdict rubric
- `references/rfc-review-checklist.md` — questions to apply while reviewing an RFC

# License
Same as repository (MIT).
