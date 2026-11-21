---
name: "PR Review"
description: "A Jedi's PR review philosophy. Use when reviewing a pull request on any of our repos."
metadata:
  cadet:
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

## Tests earn trust by runs, not reads

- **A regression test proves itself by discriminating.** Run it against the unfixed code and watch it fail, then against the fix and watch it pass — never vouch for a test's power from reading it. Swap the implementation or the test file in place and run twice; the pair of runs is the evidence.
- **Prefer the house's real-filesystem techniques over mocks.** Failure injection at a real seam beats spying on I/O primitives — park a directory at the target path and the write fails deterministically, no matter what the process runs as. Reach for a mock only when no real seam can produce the failure, and prefer the narrowest primitive when one must.
- **Hunt for prior art before a new mechanism earns approval.** If a change hand-rolls behavior that smells familiar, search the codebase before commenting — the house has usually built it already, and a parallel weaker copy drifts from the original on the next edit. Pointing at the existing shape is often the entire fix.

## The merge bar

- **Lenient.** The three requirements above are the requirements, and the bar to hit each is LOW. Don't invent extra requirements; don't gold-plate.
- Bigger PRs get more scrutiny — no line-count rule. Repeat contributors earn leniency over time.
- **Never claim a failure mode is already covered.** If you are about to say CI or the release flow would catch something, name the exact check that fails and trace the failure mode to it — a build succeeding is not runtime verification, and an integration failure that only manifests on a live system is detected by nothing unless a smoke path exists. If no detector exists, say so and own the followup to build one.
- **PRs are support tickets with extra detail, not displays of labor.** If it doesn't break something, it can merge.
- **The reviewer owns every followup.** Feedback the reviewer cannot implement personally goes to the Council, never back to the author as homework.

## Comment mechanics

- **Every comment opens with a verdict prefix: `[blocking]` blocks merge, `[nit]` does not.** The prefix is the comment's whole verdict — write it on the first line, inline, attached to the line it judges.
- **Verdicts follow the prefixes.** At least one `[blocking]` comment → Request Changes. No `[blocking]` comments → Approve.
- **Always inline** — threaded and attachable to a line; **never** top-level summary comments.
- **Short and direct** — original authors must actually read them. No praise sandwich, no optional-flavored phrasing. If it isn't worth a prefix, it isn't a comment.
- **A nit is a commitment, not a shrug.** Approving with `[nit]` comments starts the followup clock: the reviewer immediately implements every nit on the merged branch — the comment records the finding, the reviewer performs it. Anything the reviewer would not personally implement right away is not a comment.
- If the author pushes back with a reasonable argument: **escalate to the Council** — the repo owner. Don't fight to a decision; don't unilaterally defer.
- **Do not merge on our own approvals** until trust is earned and the Council says otherwise; approved PRs wait.
