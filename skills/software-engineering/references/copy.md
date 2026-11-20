# Copy: user-facing text

The words our commands print are product copy, not log output. The words our skills and docs print are product copy too. Voice rules that keep coming up in PR feedback.

## Almost never parentheses

**Rule: parentheticals are banned in copy.** No `(…)` asides in anything a user reads — console output, help text, error messages, prompts, status lines — or in skill and doc prose. Never means never in copy: if an aside is tempting, rewrite it as its own sentence or delete it.

Why: parentheticals smuggle in second thoughts. If the aside matters, it deserves its own sentence. If it doesn't, delete it. Either way the reader gets a clean line.

Rewrites, in order of preference:

1. **Own sentence** — `Install it (macOS: brew install nginx; Debian/Ubuntu: apt).` → `Install it with the package manager for your platform.` (or split the per-platform detail into a following line when the platform specifics are the point).
2. **Em dash or colon** — `Started the edge (serves webhooks only).` → `Started the edge, serving webhooks only.`
3. **Just delete** — `(pass --provider to choose another)` → gone. The flag exists; `--help` documents it.

Allowed exceptions, sparingly:

- Formal descriptors directly attached to a term: `Cadet Cloud (hosted)` style suffixes — only when the short form alone would be ambiguous. Prefer a space or dash: `Cadet Cloud — hosted`.
- Inlined command syntax that must be copied as a unit, e.g. `--domain <domain>` in usage strings — the angle brackets already signal this; no parens needed.
- Never for: platform-specific install commands (link the docs page or name the platform in its own sentence), apologies, or "BTW" facts.

## Checking a change

```bash
# String literals containing ( in the CLI's printed copy — triage each hit:
grep -rnE '"[^"]*\(|`[^`]*\(' cli/src --include='*.ts' | grep -vE '__tests__|\.test\.ts' | grep -E 'console\.|Error\(|error\(|warn\(' | less
```

Some matches are code, not copy (regex literals, type annotations on the same line, `new Error(`). Triage by eye; only the rendered text a user sees counts.
