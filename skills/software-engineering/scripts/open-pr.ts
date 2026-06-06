#!/usr/bin/env bun
/**
 * Open a pull request via the GitHub API.
 *
 * Uses the installation token already configured on the worktree's `origin`
 * remote (set by `hq auth`). No daemon secrets API call needed.
 *
 * The default repo is read from install-meta.json (`githubOrg`/`defaultRepo`).
 *
 * After opening, optionally calls register-pr.ts to wire the conversation map.
 *
 * Usage:
 *   bun run skills/software-engineering/scripts/open-pr.ts \
 *     --title "<title>" \
 *     --body-file <path> \
 *     [--base main] \
 *     [--head <branch>]    # defaults to current branch
 *     [--repo <org>/<repo>]  # defaults to githubOrg/defaultRepo from install-meta.json
 *     [--draft]
 *     [--register]         # auto-call register-pr.ts on success
 *
 * Prints the PR URL on success.
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";

// ── Install-meta config ───────────────────────────────────────────────────────

interface InstallMeta {
  botSlug?: string;
  botGitName?: string;
  botGitEmail?: string;
  githubOrg?: string;
  defaultRepo?: string;
}

function loadInstallMeta(): InstallMeta {
  const path = "/workspace/skills/software-engineering/install-meta.json";
  try {
    return JSON.parse(readFileSync(path, "utf8")) as InstallMeta;
  } catch {
    return {};
  }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function extractTokenFromRemote(remoteUrl: string): string {
  // https://x-access-token:<token>@github.com/<owner>/<repo>.git
  const m = remoteUrl.match(/x-access-token:([^@]+)@/);
  if (!m) {
    throw new Error(
      `Could not extract token from remote URL. Run 'hq auth' first.\nRemote: ${remoteUrl.replace(/:[^@]+@/, ":<redacted>@")}`,
    );
  }
  return m[1]!;
}

async function main() {
  const installMeta = loadInstallMeta();
  const args = parseArgs(process.argv.slice(2));

  const title = args.title as string | undefined;
  const bodyFile = args["body-file"] as string | undefined;
  if (!title) throw new Error("--title is required");
  if (!bodyFile) throw new Error("--body-file is required");
  if (!existsSync(bodyFile)) throw new Error(`Body file not found: ${bodyFile}`);

  // Stale-body guard: bodies that live outside `/workspace` (e.g. `/tmp`)
  // are not visible to the standard file_write tool, so a stale file from
  // a prior PR can silently get reused. Reject anything outside /workspace
  // so authors are forced into the `/workspace/scratch/` convention where
  // the file is part of the conversation's footprint and gets cleaned up.
  if (!bodyFile.startsWith("/workspace/")) {
    throw new Error(
      `Body file must live under /workspace/ (got ${bodyFile}). ` +
        `Write the body to /workspace/scratch/<pr-name>-body.md so it stays ` +
        `discoverable and avoids reusing stale /tmp files from prior PRs.`,
    );
  }
  const body = readFileSync(bodyFile, "utf8");

  const base = (args.base as string) || "main";
  const head = (args.head as string) || sh("git rev-parse --abbrev-ref HEAD");
  const defaultRepo =
    installMeta.githubOrg && installMeta.defaultRepo
      ? `${installMeta.githubOrg}/${installMeta.defaultRepo}`
      : undefined;
  const repo = (args.repo as string) || defaultRepo;
  if (!repo) {
    throw new Error(
      `--repo is required (or set githubOrg + defaultRepo in install-meta.json)`,
    );
  }
  const draft = Boolean(args.draft);
  const register = Boolean(args.register);

  const remoteUrl = sh("git remote get-url origin");
  const token = extractTokenFromRemote(remoteUrl);

  console.log(`📤 Opening PR: ${repo} ${head} → ${base}${draft ? " (draft)" : ""}`);

  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, head, base, draft }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ GitHub API ${res.status}: ${text}`);
    process.exit(1);
  }

  const pr = (await res.json()) as {
    number: number;
    html_url: string;
    head: { ref: string };
  };

  console.log(`✅ PR #${pr.number} opened: ${pr.html_url}`);

  if (register) {
    console.log(`🔗 Registering PR ↔ conversation mapping…`);
    const result = spawnSync(
      "bun",
      [
        "run",
        "/workspace/skills/software-engineering/scripts/register-pr.ts",
        "--pr",
        String(pr.number),
        "--branch",
        pr.head.ref,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.error(`⚠️  register-pr.ts exited ${result.status} — register manually.`);
    }
  }

  // Print just the URL on the last line for easy capture
  console.log(pr.html_url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
