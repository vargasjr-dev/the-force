# PR review philosophy interview — 2026-11-19

> Genericized transcript of the working session with the Council that produced
> `../SKILL.md`. Names of specific repos and tooling efforts are kept vague on
> purpose — the plugin is a starting point for any cadet.

## Q1 — primary job of a PR review
1. Guarding architecture and alignment with our North Star.
2. Catching issues that are cross-module or have implications in cloud (which PR authors don't have access to) — things that are hard to catch in CI.

We explicitly do NOT block on:
- styling
- self-contained bugs
— because we expect automated CI to mature into handling that part.

## Q2 — what you read first (strict order)
1. The PR description — confirm it captures the original user story. If the description is missing or the user story isn't clear from it → **block**.
2. Then the tests — confirm new tests were added (or old ones updated) to capture the user story. If not → **block**.
3. Then the implementation — confirm it aligns with our long-term vision for the project.

## Q3 — the merge bar
In general be quite LENIENT on the merge bar. The three requirements from Q2 (user-story description, story-capturing tests, vision-aligned implementation) are the requirements — but the bar to hit each of them should be quite LOW. Don't invent extra requirements; don't gold-plate.

## Q4 — size, churn, follow-ups
1. Size absolutely matters. No hard line-count rule for now, but bigger PRs get more scrutiny. Repeat contributors earn leniency over time.
2. Follow-ups: if it doesn't break something, it can be merged — and the REVIEWER (we) just own the follow-up instead of asking the author to do it. **PRs are support tickets with extra detail, not displays of labor.**

## Q5 — code taste
Do NOT focus on code taste in PR reviews. CI linting should evolve to be good enough to enforce taste perfectly strictly (the linting-excellence plan is working on exactly this). The reviewer's attention belongs on architecture/vision/cross-module, not taste.

## Q6 — code comments
Close to banning code comments in linting. General preference: PR comments (review threads) over code comments. A one-line comment somewhere is tolerated (likely removed later), but NEVER block on comments in review until it becomes a CI rule.

## Q7 — tests
Only UNIT tests that mock NOTHING except I/O boundaries and globals (network/db/fs/clock — the edges). The ongoing effort to delete every `mock.module` is the direction; a review should not accept new business-logic mocks. Level (unit vs integration vs e2e) beyond that: unit tests on real behavior behind seams.

## Q8 — cross-module / cloud implications
the Council can't enumerate the bug class in advance — it's a NUDGE, not a checklist: the reviewer may need OTHER repos in context while reviewing a PR (typically just the app or operator packages), and the details of those other repos must stay private/vague when they're closed source. Don't leak closed-source specifics into comments on open-source PRs.

## Q9 — review comment tone and severity
Short and direct — so original authors actually READ them. Never leave optional/followup-style feedback as review comments: if it's a followup, the reviewer just does the followup themselves. (the Council gives me followup-style feedback because in both cases I'm the one performing the followup.) So: review comments = blocking-worthy observations only, stated plainly; there is no "nit" bucket, no praise sandwich.

## Q10 — pushback
If the author disagrees with a review comment and pushes back with a reasonable argument: ESCALATE TO VARGAS. Don't fight to a decision, don't unilaterally defer.

## Q11 — delivery and verdict
ALWAYS inline comments, never summary comments (top-level GitHub comments can't be threaded; inline ones can). Verdicts: Approve / Request Changes only (no Comment-style reviews). For NOW: do NOT merge on our own approvals — the long-term goal is to earn trust over time and take over merging.

## Q12 — blind spots
Hard for the Council to answer generically — no canned blind-spot list. The skill should rely on the philosophy above (architecture/vision/cross-module focus, lenient-but-real merge bar) rather than invented checklists.

## Interview notes for the skill builder
- The two hard blocks (no user story in description / no story-capturing tests) and the escalation rule are the only absolute stops.
- Lenient everywhere else; the reviewer OWNS followups instead of requesting them.
- Taste/styling/comments = CI's job, never the reviewer's.
- Other repos may be needed in context (app/operator packages); keep closed-source details private/vague in comments on open-source PRs.
- Inline-only comments; Approve / Request Changes only; do NOT merge our own approvals yet.

