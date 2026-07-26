/**
 * Per-conversation PR state for the-force PR-linking hooks.
 *
 * The `post-tool-use` hook detects `git push` in bash tool calls and does two
 * things with the pushed worktree's origin remote:
 *
 *   1. Records the origin repo slug (`owner/repo`) as the conversation's
 *      "most recent push" target. The `post-model-call` hook uses this to
 *      hyperlink bare `PR #NNN` references to the correct GitHub repo, rather
 *      than guessing from the PR number.
 *   2. Resolves the branch's PR URL via the GitHub API and stores it so the
 *      `post-model-call` hook can append it to the final reply if the model
 *      didn't already mention it.
 *
 * Two different lifetimes:
 *   - The PR URL is per-turn: the `stop` hook clears it so the next run starts
 *     fresh and we don't re-inject a stale link.
 *   - The push repo persists for the conversation. A PR is often referenced in
 *     later turns (after the push turn ended), so the repo context must outlive
 *     the turn that pushed. It is NOT cleared by `stop`.
 */

/** PR URLs discovered during this run, keyed by conversation ID. */
const prLinks = new Map<string, string>();

/**
 * Origin repo slug (`owner/repo`) of the most recent `git push` in each
 * conversation. Persists across turns — see module docstring.
 */
const pushRepos = new Map<string, string>();

/** Get the PR URL for a conversation, if one was discovered this run. */
export function getPrLink(conversationId: string): string | undefined {
  return prLinks.get(conversationId);
}

/** Store the PR URL for a conversation. */
export function setPrLink(conversationId: string, url: string): void {
  prLinks.set(conversationId, url);
}

/** Clear the PR URL for a conversation. Called by the `stop` hook. */
export function clearPrLink(conversationId: string): void {
  prLinks.delete(conversationId);
}

/**
 * Get the origin repo slug (`owner/repo`) of the most recent push in a
 * conversation, if any push has been observed.
 */
export function getPushRepo(conversationId: string): string | undefined {
  return pushRepos.get(conversationId);
}

/** Record the origin repo slug (`owner/repo`) of the most recent push. */
export function setPushRepo(conversationId: string, repo: string): void {
  pushRepos.set(conversationId, repo);
}
