#!/usr/bin/env bun
/**
 * Post-merge / post-close worktree cleanup.
 *
 * Removes the worktree, deletes the local branch, and reports what it did.
 * Auto-detects the repo by searching all `*-wt/{botSlug}/*` worktrees if --repo
 * is not specified. The botSlug is read from assets/profile.json.
 *
 * Usage:
 *   bun run scripts/worktree-cleanup.ts --branch <name> [--repo <repo>] [--keep-branch]
 *
 * Examples:
 *   worktree-cleanup.ts --branch atl-444-fix
 *   worktree-cleanup.ts --branch dns-backend --repo vellum-assistant-platform
 *
 * The `{botSlug}/` prefix is added automatically if missing from --branch.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

// ── Profile config ────────────────────────────────────────────────────────────

interface Profile {
  botSlug: string;
  botGitName: string;
  botGitEmail: string;
  githubOrg?: string;
  defaultRepo?: string;
}

function loadProfile(): Profile {
  const path = "/workspace/skills/software-engineering/assets/profile.json";
  try {
    const profile = JSON.parse(readFileSync(path, "utf8")) as Partial<Profile>;
    if (!profile.botSlug) {
      throw new Error(`profile.json is missing required field: botSlug`);
    }
    return profile as Profile;
  } catch (err) {
    throw new Error(
      `Could not load profile from ${path}. ` +
        `See references/setup.md for first-time setup instructions.\n${err}`,
    );
  }
}

const profile = loadProfile();
const BOT_SLUG = profile.botSlug;

const USAGE = `Usage: worktree-cleanup.ts --branch <name> [--repo <repo>] [--keep-branch]

Removes a worktree and (by default) deletes the local branch.

Options:
  --branch <name>      Branch name (${BOT_SLUG}/ prefix added automatically)
  --repo <repo>        Repository name (auto-detected if omitted)
  --keep-branch        Don't delete the local branch
  -h, --help           Show this help
`;

interface Args {
  branch: string;
  repo?: string;
  keepBranch: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { keepBranch: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repo = argv[++i];
    else if (a === "--branch") args.branch = argv[++i];
    else if (a === "--keep-branch") args.keepBranch = true;
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}\n`);
      console.error(USAGE);
      process.exit(1);
    }
  }
  if (!args.branch) {
    console.error(USAGE);
    process.exit(1);
  }
  return args as Args;
}

function run(cmd: string, opts?: { cwd?: string; tolerate?: boolean }): string {
  try {
    return execSync(cmd, {
      cwd: opts?.cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (opts?.tolerate) return "";
    throw err;
  }
}

function findRepoForBranch(branchSuffix: string): string | null {
  const reposRoot = "/workspace/repos";
  const entries = readdirSync(reposRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith("-wt")) continue;
    const candidate = join(reposRoot, entry.name, BOT_SLUG, branchSuffix);
    if (existsSync(candidate)) {
      return entry.name.replace(/-wt$/, "");
    }
  }
  return null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const prefix = `${BOT_SLUG}/`;
  const branchName = args.branch.startsWith(prefix)
    ? args.branch
    : `${prefix}${args.branch}`;
  const branchSuffix = branchName.slice(prefix.length);

  const repo = args.repo ?? findRepoForBranch(branchSuffix);
  if (!repo) {
    console.error(
      `❌ Could not locate worktree for branch '${branchName}'. Pass --repo explicitly.`,
    );
    process.exit(1);
  }

  const repoPath = `/workspace/repos/${repo}`;
  const worktreePath = `/workspace/repos/${repo}-wt/${BOT_SLUG}/${branchSuffix}`;

  let removedWorktree = false;
  if (existsSync(worktreePath)) {
    console.log(`→ Removing worktree ${worktreePath}…`);
    run(`git worktree remove ${worktreePath} --force`, {
      cwd: repoPath,
      tolerate: true,
    });
    removedWorktree = true;
  } else {
    console.log(`(worktree already gone: ${worktreePath})`);
  }

  // Best-effort prune to clear any lingering metadata
  run(`git worktree prune`, { cwd: repoPath, tolerate: true });

  let deletedBranch = false;
  if (!args.keepBranch) {
    const branchExists = run(
      `git rev-parse --verify --quiet refs/heads/${branchName} || true`,
      { cwd: repoPath, tolerate: true },
    );
    if (branchExists) {
      console.log(`→ Deleting local branch ${branchName}…`);
      run(`git branch -D ${branchName}`, { cwd: repoPath, tolerate: true });
      deletedBranch = true;
    }
  }

  console.log(`\n✅ Cleanup complete`);
  console.log(`   Worktree: ${removedWorktree ? "removed" : "(was missing)"}`);
  console.log(
    `   Branch:   ${
      deletedBranch
        ? "deleted"
        : args.keepBranch
          ? "kept (--keep-branch)"
          : "(not present locally)"
    }`,
  );
  console.log(
    `\nDon't forget: close the Linear ticket and update the workstream record's plan.`,
  );
}

main();
