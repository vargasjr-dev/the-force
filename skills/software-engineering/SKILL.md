---
name: "Software Engineering"
description: "Standards and scripts for writing code. Use when creating or iterating on pull requests."
metadata:
  vellum:
    emoji: 🛠️
---

## Meta rule

Every time Vargas leaves PR feedback, ask: **"What is the broader lesson here to prevent feedback like this in the future?"** Then update the relevant file in `references/` (or add a new one if no existing topic fits). Alignment compounds.

## Grep `AGENTS.md` before any change

When working in an area, search the relevant `AGENTS.md` for keywords related to the change. Targeted grep, not `cat` — the file is too big to read top-to-bottom each time.

```bash
grep -niE 'qdrant|memory|graph' /workspace/repos/vellum-assistant/AGENTS.md
```

If `AGENTS.md` has a section on the area, **read it before writing code**. Don't discover the convention through a failed CI run. Repo-specific conventions live in each repo's `AGENTS.md` — the references in this skill are *our* conventions across repos.

## How this skill is organized

- **`SKILL.md`** (this file) — meta rule, AGENTS.md reflex, reference index.
- **`references/*.md`** — deep dives by topic. Read the relevant file before touching that area.
- **`scripts/`** — actual tooling. Each script is documented in the reference that covers its workflow.
- **`data/`** — runtime data (e.g. `pr-conversation-map.json`).

## AWS sandbox

The assistant has SSH credentials to its own AWS sandbox for end-to-end QA
work (e.g. running evals against a fresh assistant install without
torching the workstation). Don't ask Vargas where it is when a QA task
comes up — go check `references/aws-sandbox.md` (or `hq` for the SSH
helper) first. The sandbox is the canonical place to dry-run a real
benchmark sweep before promising numbers.

## Reference index

| File | Covers |
|---|---|
| `architecture.md` | Target architecture, security repros, Codex false-positives, design smells, safety nets. |
| `cli-design.md` | CRUD-shaped verbs (`get`/`refresh`, not `status`/`reconnect`). `get` is always live. No flags that flip read/write semantics. Subject at the verb level. |
| `comments.md` | Code comments vs. PR comments. No tombstones, no history narration. |
| `dependencies.md` | Anti-DI under all circumstances. Direct imports, file-based auto-registration. |
| `frontend-architecture.md` | Limit bespoke client state. Audit problems are design problems. Server-shaped data over client-side latches. |
| `git-workflow.md` | Worktrees + bot git identity. Documents `worktree-create.ts`. |
| `identity-data.md` | Sensitive identity flows from trusted sources, never LLM context. |
| `logging.md` | No PII. No auth objects. No reserved LogRecord names. |
| `naming.md` | Name things by what they are, not the subsystem that introduced them. |
| `pr-lifecycle.md` | Scope discipline, post-open registration, iteration, post-merge. Trust CI. Documents `register-pr.ts` + `worktree-cleanup.ts`. |
| `protocols.md` | Spec compliance for SSE/HTTP/WS, cross-origin credentials, transport tagging. |
| `unit-testing.md` | Mock I/O aggressively, never mock our own code. Determinism, structure, edge cases. |
| `workstreams.md` | Plan-doc conventions, Linear integration, the workstream record template. |
