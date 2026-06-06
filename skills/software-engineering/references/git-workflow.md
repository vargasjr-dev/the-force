# Git Workflow

Worktrees + bot git identity. Every commit goes through this path.

## Rules

1. **Always work in a worktree.** Never branch in `/workspace/repos/<repo>` itself. Multiple assistant conversations run in parallel against the same checkout, and another session's `git switch main` → `git pull` → `git switch <other-branch>` can destroy uncommitted work in yours.

2. **Use `worktree-create.ts` to start a branch.** It enforces every part of the convention:
   ```bash
   bun run skills/software-engineering/scripts/worktree-create.ts \
     --repo vellum-assistant \
     --branch atl-444-some-fix
   ```
   - Branch is prefixed `{botSlug}/` (added if missing; slug comes from `install-meta.json`)
   - Worktree path is `/workspace/repos/<repo>-wt/{botSlug}/<name>`
   - Created from `origin/main` after fetching, not from local `main` HEAD (local HEAD can leak commits — lesson from May 5)
   - Remote URL is copied from the main checkout so the worktree inherits the current GitHub App token
   - `node_modules` is symlinked from main to skip a full `bun install` (which would also drift `bun.lock`)
   - Bot git identity is pinned per-worktree from `install-meta.json`

3. **Refresh the token before creating the worktree** if `hq auth` is stale. The script copies whatever's in the main checkout's remote URL — refresh there first.

4. **Commit identity must be the GitHub App bot.** The name and email are read from `install-meta.json` (`botGitName` / `botGitEmail`). Verify before pushing:
   ```bash
   git config --get user.name   # should match botGitName in install-meta.json
   git config --get user.email  # should match botGitEmail in install-meta.json
   ```
   If either is wrong, run `bun run /workspace/bin/hq.ts auth` (it syncs identity every run, no need to wait for token expiry) and `git commit --amend --reset-author --no-edit` before pushing.

5. **Never commit with a wrong identity and "fix it later."** Rewriting authors on already-pushed commits is messy. Wrong identities that have leaked before and must not reappear:
   - `Vellum Assistant <assistant@vellum.ai>` (container default — what `git init` produces here)
   - Any bare email not tied to the GitHub App's user ID (GitHub renders it as a generic user, not the App)

6. **Commit eagerly during multi-file work.** Worktrees can be wiped by concurrent assistant sessions. After each meaningful step (file done, tests pass, lint clean), commit. Push as soon as the first commit lands — a remote ref protects against local-worktree destruction.
