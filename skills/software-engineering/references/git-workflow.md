# Git Workflow

Worktrees + bot git identity. Every commit goes through this path.

## Rules

1. **Always work in a worktree.** Never branch in `/workspace/repos/<repo>` itself. Multiple ApolloBot conversations run in parallel against the same checkout, and another session's `git switch main` → `git pull` → `git switch <other-branch>` can destroy uncommitted work in yours.

2. **Use `worktree-create.ts` to start a branch.** It enforces every part of the convention:
   ```bash
   bun run skills/software-engineering/scripts/worktree-create.ts \
     --repo vellum-assistant \
     --branch atl-444-some-fix
   ```
   - Branch is prefixed `apollo/` (added if missing)
   - Worktree path is `/workspace/repos/<repo>-wt/apollo/<name>`
   - Created from `origin/main` after fetching, not from local `main` HEAD (local HEAD can leak commits — lesson from May 5)
   - Remote URL is copied from the main checkout so the worktree inherits the current GitHub App token
   - `node_modules` is symlinked from main to skip a full `bun install` (which would also drift `bun.lock`)
   - Bot git identity is pinned per-worktree

3. **Refresh the token before creating the worktree** if `hq auth` is stale. The script copies whatever's in the main checkout's remote URL — refresh there first.

4. **Commit identity must be the GitHub App bot.** Name `vellum-apollo-bot[bot]`, email `242025090+vellum-apollo-bot[bot]@users.noreply.github.com`. Verify before pushing:
   ```bash
   git config --get user.name   # vellum-apollo-bot[bot]
   git config --get user.email  # 242025090+vellum-apollo-bot[bot]@users.noreply.github.com
   ```
   If either is wrong, run `bun run /workspace/bin/hq.ts auth` (it syncs identity every run, no need to wait for token expiry) and `git commit --amend --reset-author --no-edit` before pushing.

5. **Never commit with a wrong identity and "fix it later."** Rewriting authors on already-pushed commits is messy. The wrong identities that have leaked before and must not reappear:
   - `Vellum Assistant <assistant@vellum.ai>` (container default — what `git init` produces here)
   - `ApolloBot <apollo@vellum.ai>`
   - `ApolloBot <apollobot@vellum.ai>`
   - `ApolloBot <apollobot@users.noreply.github.com>` (looks bot-shaped but isn't tied to the App's user id, so GitHub renders it as a generic user)

6. **Commit eagerly during multi-file work.** Worktrees can be wiped by concurrent ApolloBot sessions. After each meaningful step (file done, tests pass, lint clean), commit. Push as soon as the first commit lands — a remote ref protects against local-worktree destruction.
