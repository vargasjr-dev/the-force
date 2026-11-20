---
name: "PR Review"
description: "A Jedi's PR review philosophy. Use when reviewing a pull request on any of our repos."
metadata:
  vellum:
    emoji: 🔍
---

## What a review is for

Two jobs, in priority order:

1. **Guard architecture and alignment with a project's North Star**. The long-term vision outranks local correctness.
2. **Catch cross-module issues and cloud implications the author cannot see** — bug classes CI structurally can't catch. Keep other repos in context while reviewing. Closed-source repo details stay private/vague in comments on open-source PRs — never leak them.

Explicitly NOT the review's job — CI's job:

- styling and code taste
- self-contained bugs
- code comments — a one-liner is tolerated, never a block, until linting bans them outright

## The review sequence

1. **Description.** Does it capture the original user story? Missing or unclear → Request Changes.
2. **Tests.** Were new tests added — or old ones updated — that capture the user story in runtime logic, unit tests that mock nothing except I/O boundaries and globals? No → Request Changes. A test that only asserts static file contents — string-grepping a Dockerfile or a source file — is static code analysis, not a unit test; it doesn't count.
3. **Implementation.** Does it align with the long-term vision? Any cross-module or cloud implications? This is where other repos in context earn their keep.

## The merge bar

- **Lenient.** The three requirements above are the requirements, and the bar to hit each is LOW. Don't invent extra requirements; don't gold-plate.
- Bigger PRs get more scrutiny — no line-count rule. Repeat contributors earn leniency over time.
- **Never claim a failure mode is already covered.** If you are about to say CI or the release flow would catch something, name the exact check that fails and trace the failure mode to it — a build succeeding is not runtime verification, and an integration failure that only manifests on a live system is detected by nothing unless a smoke path exists. If no detector exists, say so and own the followup to build one.
- **PRs are support tickets with extra detail, not displays of labor.** If it doesn't break something, it can merge.
- Anything optional or followup-shaped is NEVER a review comment: the reviewer owns the followup — open the issue, do the work. Followup-style feedback only ever flows from the Council down to the reviewer, because in both cases the reviewer is the one who performs it.

## Comment mechanics

- **Always inline** — threaded and attachable to a line; **never** top-level summary comments.
- **Short and direct** — original authors must actually read them. No praise sandwich, no optional-flavored phrasing. If it isn't worth blocking on, it isn't a comment.
- Verdicts: **Approve / Request Changes only** — no Comment-style reviews.
- If the author pushes back with a reasonable argument: **escalate to the Council** — the repo owner. Don't fight to a decision; don't unilaterally defer.
- **Do not merge on our own approvals** until trust is earned and the Council says otherwise; approved PRs wait.

## Provenance

Distilled from an interview with the Council on 2026-11-19 — see `references/interview-2026-11-19.md`. Update this file whenever review feedback reveals a broader lesson — same compounding rule as the software-engineering skill.
