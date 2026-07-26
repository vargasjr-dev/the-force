/**
 * post-tool-use hook — detect git push and resolve the PR link.
 *
 * Inspects bash tool calls for `git push` and, when found, resolves the
 * current branch's PR URL via the GitHub API. The URL is stored in the
 * per-conversation pr-link-store so the sibling `post-model-call` hook can
 * inject it into the final reply if the model didn't already mention it.
 *
 * Best-effort: if the GitHub API call fails (no token, network error, no PR
 * for the branch), the hook silently moves on. Only fires on successful
 * (non-error) bash results.
 */

import { execSync } from "node:child_process";

import type { PluginHookFn, PostToolUseContext } from "@vellumai/plugin-api";

import { getPrLink, setPrLink, setPushRepo } from "../src/pr-link-store.js";

/** Match `git push` in a bash command string, allowing flags between git and push (e.g. `git -C /path push`). */
const GIT_PUSH_RE = /\bgit\b(?:\s+(?:-[A-Za-z]+(?:\s+\S+)?))*\s+push\b/;

/** Common remote names to skip when parsing positional args. */
const REMOTE_NAMES = new Set(["origin", "upstream", "github"]);

/**
 * Extract a working directory from a bash command.
 * Handles two forms:
 *   1. `cd /path && ...` before the `git push` segment
 *   2. `git -C /path push ...` — the -C flag on the git command itself
 * so that git commands run in the worktree where the push actually happened,
 * not the hook process's own CWD (which may have no remote).
 */
function extractCwdFromCommand(command: string): string | undefined {
  const pushIdx = command.search(GIT_PUSH_RE);
  const prefix = pushIdx === -1 ? command : command.slice(0, pushIdx);

  // Form 1: cd /path && git push
  const cdMatch = prefix.match(
    /(?:^|&&)\s*cd\s+["']?([^"'\s]+)["']?\s*(?:&&|$)/,
  );
  if (cdMatch?.[1]) return cdMatch[1];

  // Form 2: git -C /path push (resolve shell variables like $WT)
  const cMatch = command.match(/\bgit\b\s+-C\s+["']?([^"'\s]+)["']?/);
  if (cMatch?.[1]) {
    const rawPath = cMatch[1];
    // Resolve $VAR and ${VAR} references from the environment.
    const resolved = rawPath.replace(
      /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g,
      (_, name) => process.env[name] ?? "",
    );
    if (resolved && !resolved.includes("$")) return resolved;
  }

  return undefined;
}

/**
 * Extract the branch name from a `git push` command. Handles:
 *   - `git push origin <branch>` — second positional is the branch
 *   - `git push <branch>` — first positional is the branch
 *   - `git push` or `git push origin` — null (fall back to current branch)
 */
function extractBranchFromPushCommand(command: string): string | null {
  const pushIdx = command.search(GIT_PUSH_RE);
  if (pushIdx === -1) return null;

  const afterPush = command.slice(pushIdx).replace(GIT_PUSH_RE, "");
  const tokens = afterPush.trim().split(/\s+/).filter(Boolean);

  const positional: string[] = [];
  for (const tok of tokens) {
    if (tok.startsWith("-")) continue;
    positional.push(tok);
  }

  if (positional.length >= 2) return positional[1]!;
  if (positional.length === 1 && !REMOTE_NAMES.has(positional[0]!)) {
    return positional[0]!;
  }
  return null;
}

/** Extract the GitHub token from a git remote URL. */
function extractGithubToken(remoteUrl: string): string | null {
  const match = remoteUrl.match(
    /https:\/\/x-access-token:([^@]+)@github\.com\//,
  );
  return match?.[1] ?? null;
}

/** Extract owner/repo from a GitHub remote URL. */
function extractOwnerRepo(
  remoteUrl: string,
): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
  if (match) return { owner: match[1]!, repo: match[2]! };
  return null;
}

/**
 * Resolve the PR URL for a branch via the GitHub API.
 * Returns the PR HTML URL or null if not found / API failed.
 */
async function resolvePrUrl(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const prs = (await res.json()) as Array<{ html_url: string }>;
    if (prs.length === 0) return null;
    return prs[0]!.html_url;
  } catch {
    return null;
  }
}

const postToolUse: PluginHookFn<PostToolUseContext> = async (ctx) => {
  if (ctx.toolResponse.is_error === true) return;
  if (getPrLink(ctx.conversationId)) return;

  // Find the tool_use block to get the command.
  let command: string | undefined;
  let toolName: string | undefined;
  for (const msg of ctx.messages) {
    if (msg.role !== "assistant") continue;
    for (const block of msg.content) {
      if (
        block.type === "tool_use" &&
        block.id === ctx.toolResponse.tool_use_id
      ) {
        toolName = block.name;
        command = (block.input as { command?: string }).command;
      }
    }
  }

  if (!command || !GIT_PUSH_RE.test(command)) return;
  if (toolName !== "bash" && toolName !== "host_bash") return;

  // Extract branch from the command, or fall back to current branch.
  const cwd = extractCwdFromCommand(command);

  let branch = extractBranchFromPushCommand(command);
  if (!branch) {
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf-8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "ignore"],
        ...(cwd ? { cwd } : {}),
      }).trim();
    } catch {
      return;
    }
  }

  // Get the remote URL to extract token + owner/repo.
  let remoteUrl: string;
  try {
    remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf-8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
      ...(cwd ? { cwd } : {}),
    }).trim();
  } catch {
    return;
  }

  const token = extractGithubToken(remoteUrl);
  if (!token) return;

  const ownerRepo = extractOwnerRepo(remoteUrl);
  if (!ownerRepo) return;

  // Record the origin repo as the conversation's most-recent-push target so
  // the post-model-call hook can hyperlink bare `PR #NNN` references to the
  // right repo. Done before PR resolution: even if this branch has no open PR
  // yet, the push established which repo we're working in.
  setPushRepo(ctx.conversationId, `${ownerRepo.owner}/${ownerRepo.repo}`);

  const prUrl = await resolvePrUrl(
    ownerRepo.owner,
    ownerRepo.repo,
    branch,
    token,
  );
  if (prUrl) {
    setPrLink(ctx.conversationId, prUrl);
    ctx.logger.info(
      {
        plugin: "the-force",
        conversationId: ctx.conversationId,
        prUrl,
      },
      "Detected git push, resolved PR URL",
    );
  }
};

export default postToolUse;
