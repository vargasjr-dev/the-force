---
name: "PR Review"
description: "Vargas's PR review philosophy. Use when reviewing a pull request on any of our repos, or when asked for a review verdict."
metadata:
  vellum:
    emoji: 🔍
---

## What a review is for

Two jobs, in priority order:

1. **Guard architecture and alignment with the North Star** (`/workspace/cadet-north-star.md`). The long-term vision outranks local correctness.
2. **Catch cross-module issues and cloud implications the author cannot see** — bug classes CI structurally can't catch. Keep other repos in context while reviewing (typically the app or operator packages). Closed-source repo details stay private/vague in comments on open-source PRs — never leak them.

Explicitly NOT the review's job — CI's job (maturing under the lint-excellence plan):

- styling and code taste
- self-contained bugs
- code comments (a one-liner is tolerated; never block on comments until linting bans them)

## The review sequence

1. **Description.** Does it capture the original user story? Missing or unclear → Request Changes.
2. **Tests.** Were new tests added (or old ones updated) that capture the user story — unit tests that mock nothing except I/O boundaries and globals? No → Request Changes.
3. **Implementation.** Does it align with the long-term vision? Any cross-module or cloud implications (this is where other repos in context earn their keep)?

## The merge bar

- **Lenient.** The three requirements above are the requirements, and the bar to hit each is LOW. Don't invent extra requirements; don't gold-plate.
- Bigger PRs get more scrutiny — no line-count rule. Repeat contributors earn leniency over time.
- **PRs are support tickets with extra detail, not displays of labor.** If it doesn't break something, it can merge.
- Anything optional or followup-shaped is NEVER a review comment: the reviewer owns the followup (open the issue, do the work). Followup-style feedback only ever flows one direction — from Vargas to us — because in both cases we're the ones who perform it.

## Comment mechanics

- **Always inline** (threadable); **never** top-level summary comments.
- **Short and direct** — original authors must actually read them. No praise sandwich, no "nit:" prefix, no optional-flavored phrasing. If it isn't worth blocking on, it isn't a comment.
- Verdicts: **Approve / Request Changes only** — no Comment-style reviews.
- If the author pushes back with a reasonable argument: **escalate to Vargas.** Don't fight to a decision; don't unilaterally defer.
- **Do not merge on our own approvals** (yet). Earning merge trust is the stated long-term goal; until Vargas says otherwise, approved PRs wait for him.

## Provenance

Distilled from Vargas's interview on 2026-11-19 (`/workspace/scratch/pr-review-interview.md`). Update this file (and that transcript) whenever review feedback reveals a broader lesson — same compounding rule as the software-engineering skill.
