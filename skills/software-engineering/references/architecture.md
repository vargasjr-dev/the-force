# Architecture

## Migrations are frozen, not shared

**Don't extract shared code between a workspace/database migration and a live evolving consumer (CLI command, daemon service, anything that can be re-run on demand).**

Migrations are historical snapshots — once they've run against a workspace, their behavior is locked in. If you share live logic between a migration and an evolving consumer, then any future bug fix or schema-aware refactor in the shared code retroactively changes what the migration *would have done* against a workspace it has already finished running on. That's invisible drift between code reality and database reality.

The two consumers should be free to drift. Migration 028 stays a 271-line self-contained snapshot of "what disk-view recovery looked like when this migration shipped". The `db repair` conversation-backfill step gets its own inlined copy so it can evolve — handle new edge cases, fix bugs, adapt to schema changes — without any backward compatibility constraint from old workspaces.

The duplication is a feature, not a smell.

**Lesson** — PR #32642: I extracted `workspace/recovery/conversations-from-disk.ts` shared between migration 028 and the new repair step. Codex flagged it, Vargas confirmed: "codex is right - revert the changes to the migration and have the repair step have its own copy."



Architectural awareness: target architecture, security repros, design smells, safety nets. The AGENTS.md grep reflex is in SKILL.md root.

## Rules

1. **Follow the target architecture, not the legacy one.** When a parallel workstream is actively migrating ownership of a subsystem (e.g. gateway security migration moving guardian ops from assistant to gateway), build on the **target**. Don't proxy to the legacy owner — implement directly in the new owner, even if it means copying a little logic temporarily. Avoid creating new dependencies on the system you're deprecating.

2. **Unreleased features have no backward compatibility.** No legacy fallback routes. No version-skew detection. No migration shims. Just ship the clean version. Compat is for things real users depend on.

3. **Security fixes need a one-line repro.** Before opening a PR for a security fix, write a one-line repro that succeeds against unpatched code and fails against patched code. Don't trust security semantics from naming alone — `~/.vellum/protected/` is still bash-readable. If you can't write the repro, the fix isn't a fix. Repro goes in the PR description.

4. **Update `AGENTS.md` when Codex flags a false positive.** If a vulnerability scanner re-flags something that isn't real, update the relevant `AGENTS.md` so the scanner can read why it's not an issue. The fix is in `AGENTS.md`, not in the code.

5. **Overlap between static config and allocated resources is a design smell.** When `config.x.url` and `resources.xPort` can diverge — one in workspace config, one in a CLI lock file — a helper that reads env overrides is papering over the real problem. Pick a single source of truth: materialize the allocated resource into the config, or remove the overlapping config field entirely. Flag at review time; don't ship the helper as if it were the fix.

5a. **No lossy projections at consumer boundaries.** When a refactor centralizes a metadata field (e.g. `OwnerKind` in the tool registry), every consumer that needs that field should accept the *source-of-truth union*, not a custom narrower union projected at the construction site. The IIFE-shaped projection — `toolOrigin: (() => { if (kind === "skill" || kind === "plugin") return "skill"; if (tool) return "builtin"; return undefined; })()` — is the tell: you're collapsing a richer type into a poorer one because the consumer's interface was written against the old shape. Widen the consumer's type to the source-of-truth union, spell out the disjunction at the use site (`x === "skill" || x === "plugin"`), and let the type system carry the full signal. The codebase ends up using *one* vocabulary for ownership, not N+1 (the source-of-truth one + a custom narrower one per consumer). Codified after PR #32294 review: Vargas — "this `toolOrigin` field should just be the same type as `ownerKind`." Fixed in PR #32339.

6. **Keep safety nets as internal fallbacks.** When moving edge-case handling from runtime to a launcher (e.g. macOS AF_UNIX path-limit handling moved from `resolveIpcSocketPath` to `hatch`), keep the fallback chain in the runtime code too. It's the safety net for non-launcher-spawned processes — dev source mode, manual starts. Don't rely solely on the launcher to set the right env vars.

7. **Fix LLM output with prompts first, not regex.** When the model produces the wrong *kind* of output (wrong voice, wrong tone, wrong perspective), the first attempt is a prompt change. A regex/string-match post-filter that approximates the model's judgement is the pattern the AGENTS.md "Assistant-Driven Judgement" rule forbids — and it inevitably over-rejects (`/^I think/` kills "I think Tuesday works"). Land the soft fix, observe in real traffic, escalate to a daemon-routed LLM judge only after the prompt proves insufficient. Never ship both at once — you can't tell which one is doing the work. Codified after PR #30834: a contributor stacked a regex filter on top of a prompt change; Vargas asked to drop the filter and try prompts alone first (re-rolled as PR #32011).

8. **When data is a property of an entity, store it on the entity — not in a side-map keyed by it.** The "registry keyed by identifier" pattern (`policyRegistry: Map<endpoint, Policy>`, `iconsByName: Map<string, Icon>`, etc.) requires a runtime join between two structures whose source files don't reference each other. Joins drift: you add the entity, forget the side-map entry, and the lookup silently returns `undefined`. The fix is to put the field on the entity's definition (`RouteDefinition { policy: Policy | null }`), make it required so omission is a type error, and resolve at construction time — not at lookup time. A registry is appropriate only for genuinely cross-cutting indices (e.g. "all handlers for a feature flag") where no single entity owns the data. Codified after PR #32549 review: ATL-315 consolidated two policy tables into one (`resolveRoutePolicy`), but the policy still lived in a side-registry keyed by `endpoint:method`. Vargas asked for the followup PR to put the policy on the `RouteDefinition` directly. The key test: if removing the side-map would force every entity to declare the field explicitly, that's the version that prevents drift.
