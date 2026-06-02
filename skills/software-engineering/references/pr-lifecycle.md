# PR Lifecycle

Scope discipline, post-open registration, iteration on review feedback, post-merge cleanup. CI catches build/test issues — we trust it. Run things locally only when CI is failing or it's otherwise clearly needed.

## Rules

1. **One concern per PR.** If a bug fix can be done by centralizing a helper in consumer sites, stop there. Don't also make the API idempotent or add reset machinery in the same PR — that defensive machinery is a separate concern. Land the fix, file the follow-up.

2. **Minimize the diff.** If a thin alias keeps the diff small, use it: `const db = getGatewaySqlite()` beats renaming every call site. Smaller diffs are easier to review, easier to bisect, and less likely to bury the real change in noise.

3. **Push with `--no-verify`.** Trust CI for type checks, tests, and lint. Don't run expensive global checks on every push when CI is already going to. Run locally only when CI has clearly failed and you need to reproduce, or when the iteration loop demands it.

4. **Register the PR ↔ conversation mapping immediately after opening.** From the worktree (so `--repo` and `--branch` auto-detect):
   ```bash
   bun run /workspace/skills/software-engineering/scripts/register-pr.ts --pr <number>
   ```
   Writes to `skills/software-engineering/data/pr-conversation-map.json`, keyed `<repo>:<prNumber> → conversationId`. The github-poll cron reads this map **first** when waking conversations on CI/review events. Without an entry, the cron falls back to URL-scanning recent conversations and tends to pin every PR to whatever was most recently active. **Highest-signal post-push action.**

5. **Add the PR link to the workstream record.** Under `/workspace/data/apps/workstream-command-center/records/`, in the `plan` field. Required for the GitHub poll cron to route review feedback back to the right conversation. If the PR isn't in a workstream, the feedback loop is broken.

6. **Post the full PR URL in the conversation.** Vargas should have the link without asking. Telegram doesn't auto-link PR numbers — paste the full URL. Use full markdown links in plans: `[PR #123](https://github.com/vellum-ai/<repo>/pull/123)`.

7. **Don't reference Linear ticket IDs in PR titles, descriptions, or commits.** Keep ticket refs in internal planning docs only.

8. **Every reviewer comment gets a response.** Human OR bot — Codex, Devin, anyone. Either iterate on the feedback or reply with a concise technical rationale (alternative approach, why it's preferable, any precedent). Never silently skip a comment.

9. **Human reviewer feedback comes first.** Vargas merges the PR — address his comments before bot comments.

10. **Bot reviewers (Codex, Devin) are real reviewers.** They've caught real bugs. Fetch ALL comments — never filter `.includes("bot")` out, or Codex P1s and Devin 🔴s will be silently missed.

11. **PR feedback overrides chat directives.** If Vargas gave a fast directive in chat but his PR review reveals concerns the directive didn't anticipate, the PR review wins.

12. **Send the full PR URL on every iteration push.** Vargas often says "Link me" — make him not have to.

13. **On merge, run `worktree-cleanup.ts`.** Auto-detects the repo from the current dir, removes the worktree at `/workspace/repos/<repo>-wt/apollo/<name>`, deletes the local branch:
    ```bash
    bun run /workspace/skills/software-engineering/scripts/worktree-cleanup.ts \
      --branch <name>
    ```

14. **Close the Linear ticket on actual merge, not on PR open.** Update the workstream record — move the task to `## Completed`. Clean up scratch files created during the PR.

15. **Check `merged`, not just `state`.** PRs can be silently closed without merge. `state=closed` + `merged=true` = landed. `state=closed` + `merged=false` = abandoned/rejected. Treat them differently.

16. **Review feedback that forces a new abstraction is a follow-up, not an expansion.** If addressing a review comment would introduce a new helper type / defaults system / cross-cutting refactor that the original PR didn't have, *stop* and ask whether it belongs in this PR or a follow-up. Default to the follow-up. The narrower diff lands faster, the abstraction gets its own review thread, and the original concern doesn't get buried. Rule #1 is the principle; this rule is its review-time corollary.

17. **Touch a `package.json` → commit the matching `bun.lock` in the same change.** Every CI job runs `bun install --frozen-lockfile`; an unrefreshed lockfile errors out before any actual check (lint, typecheck, test, build) runs — so the logs *look* like five things failed when really it's one missing commit. Reflex: after editing any `package.json`, run `bun install` in that directory and `git add <dir>/bun.lock` alongside the manifest. Don't trust a clean tsc run locally to mean you remembered the lockfile — local installs may already have the dep on disk from prior work in the worktree.

18. **Touch a file under `skills/<name>/` → regenerate `skills/catalog.json` in the same change.** The vellum-assistant catalog records each skill's `updatedAt` from `git log -1 --format=%aI -- skills/<name>/`. CI runs `node scripts/skills/check-catalog.mjs` on every PR that touches `skills/**` and fails with "Check catalog.json is up to date" if regen would produce a diff. Reflex: after editing any file under `skills/<name>/`, run `node scripts/skills/generate-catalog.mjs` from repo root and `git add skills/catalog.json` alongside. Same shape as the bun.lock rule — denormalized state in source that CI verifies.

19. **Grep AGENTS.md before writing code, and let the pre-commit hook run.** The repo's `scripts/check-generic-examples.ts` (wired to `.githooks/pre-commit`) catches *shape-based* leaks — non-example emails and phone numbers — but is intentionally *quote-anchored* and won't flag bare prose like a real-person name in a `// comment`. Real-name and internal-handle blocking lives in a **local** patterns file at `~/.config/vellum-content-check/patterns.json` (see `scripts/generic-examples/README.md` for the schema). Project-specific terms — real-person first names, GitHub handles, internal usernames — go there as `BLOCK` patterns. Configured once; protects every commit thereafter. Reflex: **don't `git commit --no-verify`** unless you have a specific reason and the hook output is wrong. Reference the relevant AGENTS.md sections in PR bodies under an `### AGENTS.md compliance` heading so reviewers and Codex can hold the line.

## Lessons

- **PR #27459** — A fix that centralized `resolveQdrantUrl` also added an idempotent initializer and reset hooks. Vargas asked to scope down to just the centralization; the defensive machinery became a follow-up. Rule #1 codified.

- **PR #32028** — Added `zod` to `apps/web/package.json` but never committed the matching `bun.lock` entry. All five CI jobs (Lint, Type Check, Test, Build, rollup) reported failure because `bun install --frozen-lockfile` rejected the lockfile drift before any of them got to run their real task. Logs misleadingly suggested broad regression; the real fix was one line in `bun.lock`. Rule #16 codified.

- **PR #32132** — Dropped `ownerSkillVersionHash` from Tool and incidentally touched `skills/meet-join/__tests__/entrypoint.test.ts`. The `pr-skills` workflow ran `check-catalog.mjs`, which regenerated and found two `updatedAt` diffs: meet-join (rightly mine, since my commit was now the latest touching that dir) and llm-cost-optimizer (pre-existing drift from PR #31848's squash-merge changing the commit date after the catalog was regenerated locally). One `node scripts/skills/generate-catalog.mjs` + amend + force-push fixed it. **Two takeaways:** (1) Reflex above — regen catalog whenever touching any `skills/<name>/` file. (2) Squash-merge always invalidates timestamps for the squashed PR's skills since the catalog locks in the pre-merge author date. Drift accumulates silently on `main` (CI only runs on PRs) until the next skill PR catches it. Rule #18 codified.

- **PR #32017 — review-driven scope creep.** Round 1 was a small "stamp executionTarget at load time" diff (~38 files, mostly one-line per construction site). Vargas's Round 1 review included one comment whose natural fix was wider than the PR's stated concern: *"All of these should implement ToolDefinition instead, so that we could share default methods and not need these executionTarget diffs."* I treated that as in-scope, built out `TOOL_DEFAULTS` + `finalizeTool` + `ToolInput` + switched every class to `implements ToolDefinition` + rewrote every proxy literal and several tests (+289/-336 across 40 files). Round 2 review flagged 8 new concerns — at which point Vargas said *"the scope might be too big to tackle in one go"* and asked for the split. **Lesson:** when a piece of review feedback would force a *new abstraction* (a defaults system, a helper type, a refactor of N call sites) rather than tweaking the existing diff in place, that's a *follow-up* signal — not an expansion signal. Ask before expanding; default to a follow-up PR. Codified as Rule #17 below.

- **PR #32244 — real-name leak in comments.** Two code comments referenced the reviewer by name (e.g. `// what <Name> asked for`). Codex flagged it as a P1 against AGENTS.md's "Generic Examples" rule. Root cause: the in-repo `check-generic-examples` patterns are quote-anchored and shape-based — they don't catch bare prose in `//` comments. Fix had two parts: (1) scrub the comments and rewrite them to describe the UX requirement without the name; (2) install a *local* patterns file at `~/.config/vellum-content-check/patterns.json` with `BLOCK` rules for the real names and handles that recur in our work, so the pre-commit hook catches it next time. Vargas also asked that PR bodies reference AGENTS.md so reviewers can hold the line — the new `### AGENTS.md compliance` section in the PR body handles that. Codified as Rule #19.

- **PR #32307 — format:check is a separate gate from lint.** Local `lint` + `typecheck` + `bun test` all passed (194 tests green), so the PR went out. CI's "Evals lint, type check & test" job runs `format:check` as part of the same script chain and red-X'd the run on prettier drift across 5 files (README + 4 TS files I'd authored). One `bun run format` → commit → push fixed it (`df23313884`), no behavioral change. **Lesson:** for any TS/markdown change, treat `bun run format:check` (or just `bun run format`) as part of the local greenlight gate — it's a *distinct* CI step from `lint` and isn't covered by ESLint. Cheap to run, cheaper than a red CI cycle.

- **PR #32335 → #32354 — read the canonical SCHEMA file, not the README of a previous version.** For the LongMemEval-V2 loader I keyed the zod schema off the V1 GitHub README (which documents `question_id` + `question_date`). The published V2 dataset ships a `SCHEMA.md` that uses `id` and has no `question_date` at all — meaning the loader as merged in #32335 rejected every real `questions.jsonl` row before the haystack join. Codex caught it post-merge as a P1; fix shipped as #32354. **Lesson:** when integrating an external dataset or spec, fetch the canonical `SCHEMA.md` (or equivalent schema-of-record file) *before* writing the loader — don't substitute a previous version's README or a dataset-card prose summary. Add a regression test (e.g. "rejects V1-shaped rows") so future schema drift surfaces as a line-numbered validation error, not as a silent downstream join mismatch.

- **PR #32392 → #32395 — `lint:unused` (knip) is a separate gate that catches dynamic-import registration.** Two new `benchmarks/<id>/src/run.ts` modules were loaded by `await import(\`../../benchmarks/${id}/src/run.ts\`)` — the file-based-registry pattern (anti-DI rule 5). Local `lint` + `typecheck` + `test` + `format:check` were all green, so the PR shipped. CI's `Evals lint, type check & test` job runs five steps and the fifth (`bun run lint:unused`, which invokes knip with reachability analysis) flagged both files as unreachable — correctly, since knip can't see through a dynamic-id `import()`. Fix was one `knip.json` glob: add `benchmarks/*/src/run.ts` to `entry`. **Two takeaways:** (1) Local greenlight gate for the evals package is *five* steps now — `lint`, `typecheck`, `test`, `format:check`, **and `lint:unused`**. Run all five before declaring "all green". (2) Whenever a PR introduces file-based dynamic registration, the static analyzer needs to be told about the convention up front — either via an `entry` glob (preferred — keeps it zero-config for the next addition) or an explicit allowlist.
