# Code Comments

The codebase describes the current state. Git history holds the story. PR threads hold the rationale.

## Rules

1. **Never narrate history in code comments.** No "Historically", "used to", "previously", "no longer does X", "Now the first init wins". Comments describe the current codebase, not the journey. `AGENTS.md` forbids these phrases explicitly.

2. **No tombstone comments.** Delete code, don't leave ghosts. Never write `// handleFoo removed (ATL-XXX) — restricted to Y`. Git history explains what was removed.

3. **Inline comments are rare.** Prefer self-documenting code — clear names, small functions, obvious structure. When context IS needed, the comment must describe what the code does *now*, not why it changed or what came before.

4. **Important rationale belongs in PR comments, not code.** When a non-obvious choice (gotcha, picking option A over option B, working around a quirk) needs to be discoverable for future readers, post it as a PR review comment on the specific line — NOT as an inline code comment. Git blame surfaces the PR for that line; the threaded comment is one click away. This applies even when the rationale is genuinely useful — the test isn't "is the explanation valuable?", it's "is it describing the *current state* or the *story behind it*?" The story always goes in the PR.

5. **1-2 line comments if you must**. Remember, our position is that code comments make code less readable not more readable. If we want to make code easy to understand, we build systems that are easy to understand, not rely on the bandaids that are code comments. So if you must add some, keep it minimal.

6. **Don't delete other people's comments**. We are in the minority in this opinion and should not impose our will on other collaborator's logic. Only apply it on logic we are creating or editing.

## Lessons

- **PR #27459** — Devin flagged 3 narration comments across `qdrant-client.ts` and its test: "Historically this function...", "used to clobber", "ended up overwriting". All deleted.
- **PR #6424** — A 9-line block in `web/Dockerfile` explained why we read the mounted secret via `cat` instead of `--mount=...,env=X`, naming PR #6406 and a Dockerfile-frontend-v1.10 gotcha. Vargas: "Just clear out that comment, and instead leave the rationale as a GitHub comment." The rationale went into `#issuecomment-4420519128`.
- **PR #32632** — The `repair-steps.ts` module-level doc and `repair.ts` listed the step sequence with `(this PR)`, `(next PR)`, `(future)` annotations naming what hadn't shipped yet. Vargas: "Delete references to PR or the future in comments." The rule is symmetric: "used to do X" is history narration; "in a future PR will do Y" is *future* narration. Both belong in the PR thread, not the code. The fix is to describe the abstraction (a sequence of steps, append more by extending the array) without enumerating future entries.
