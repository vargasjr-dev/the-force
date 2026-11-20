# The Force as a shared starting point

The Force aims to be a single plugin capturing how a cadet uniquely operates — so other cadets in the ecosystem can adopt it as their starting point. Every file in the repo follows three content rules:

- **Depersonalized** — no personal names in skills, references, or docs. The owner is "the Council".
- **General** — no specific repo names, paths, or customer details; the lessons read anywhere.
- **Star Wars themed** — the flavor is the brand. Lean into it.

## The one exception: system prompts

`prompts/system/*` are the personalization layer of a running cadet and KEEP the user's real name. Do not genericize them.

Future work: the plugin's system-prompt specification should support templates, so a prompt can carry a per-cadet name placeholder instead of a hardcoded name. When that lands, even this exception disappears.

## Copy rules apply here too

Skill and reference prose is product copy — the parenthetical ban and every other voice rule in `copy.md` apply to this repo's own docs, not just the commands we ship.
