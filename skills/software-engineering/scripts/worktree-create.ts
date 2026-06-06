#!/usr/bin/env bun
/**
 * Create a worktree the right way.
 *
 * Conventions enforced:
 *   - Branch name is prefixed `{botSlug}/` (read from install-meta.json)
 *   - Worktree path is `/workspace/repos/<repo>-wt/{botSlug}/<name>`
 *   - Created from `origin/main` (after fetching), NOT local main HEAD
 *   - Remote URL is updated with the current token from the main checkout
 *   - Optionally symlinks node_modules from main checkout (skips a full `bun install`)
 *
 * Usage:
 *   bun run scripts/worktree-create.ts --repo <name> --branch <name> [--no-symlink]
 *
 * Examples:
 *   worktree-create.ts --repo vellum-assistant --branch atl-444-fix
 *   worktree-create.ts --repo vellum-assistant-platform --branch dns-backend
 *
 * The `{botSlug}/` prefix is added automatically if missing from --branch.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Install-meta config ───────────────────────────────────────────────────────
// Bot identity and branch prefix are per-installation. Set these in
// /workspace/skills/software-engineering/install-meta.json:
//
//   {
//     "botSlug":    "apollo",                                          // branch prefix
//     "botGitName": "vellum-apollo-bot[bot]",                         // git user.name
//     "botGitEmail": "242025090+vellum-apollo-bot[bot]@users.noreply.github.com"
//   }
//
// Verify bot user ID at: https://api.github.com/users/{botGitName}
// Anything else is a bug — do not hard-code these values here.

interface InstallMeta {
  botSlug: string;
  botGitName: string;
  botGitEmail: string;
  githubOrg?: string;
  defaultRepo?: string;
}

function loadInstallMeta(): InstallMeta {
  const path = "/workspace/skills/software-engineering/install-meta.json";
  try {
    const meta = JSON.parse(readFileSync(path, "utf8")) as Partial<InstallMeta>;
    if (!meta.botSlug || !meta.botGitName || !meta.botGitEmail) {
      throw new Error(
        `install-meta.json is missing required fields: botSlug, botGitName, botGitEmail`,
      );
    }
    return meta as InstallMeta;
  } catch (err) {
    throw new Error(
      `Could not load install-meta.json from ${path}. ` +
        `Set botSlug, botGitName, and botGitEmail for this installation.\n${err}`,
    );
  }
}

const meta = loadInstallMeta();
const BOT_SLUG = meta.botSlug;
const BOT_GIT_NAME = meta.botGitName;
const BOT_GIT_EMAIL = meta.botGitEmail;

const USAGE = `Usage: worktree-create.ts --repo <repo> --branch <name> [--no-symlink]

Creates a worktree at /workspace/repos/<repo>-wt/${BOT_SLUG}/<name> from origin/main.
The "${BOT_SLUG}/" prefix is added automatically if missing from --branch.

Options:
  --repo <repo>       Repository name (e.g. vellum-assistant)
  --branch <name>     Branch name (${BOT_SLUG}/ prefix added automatically)
  --no-symlink        Skip symlinking node_modules from the main checkout
  -h, --help          Show this help

Run \`./bin/hq auth\` first if your token is stale — this script copies the
remote URL from the main checkout, so its token is what the worktree gets.
`;

interface Args {
  repo: string;
  branch: string;
  symlinkNodeModules: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { symlinkNodeModules: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repo = argv[++i];
    else if (a === "--branch") args.branch = argv[++i];
    else if (a === "--no-symlink") args.symlinkNodeModules = false;
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}\n`);
      console.error(USAGE);
      process.exit(1);
    }
  }
  if (!args.repo || !args.branch) {
    console.error(USAGE);
    process.exit(1);
  }
  return args as Args;
}

function run(
  cmd: string,
  opts?: { cwd?: string; capture?: boolean },
): string {
  const stdio: ["ignore", "pipe" | "inherit", "pipe" | "inherit"] =
    opts?.capture === false
      ? ["ignore", "inherit", "inherit"]
      : ["ignore", "pipe", "pipe"];
  return execSync(cmd, {
    cwd: opts?.cwd,
    encoding: "utf-8",
    stdio,
  })?.toString().trim() ?? "";
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const prefix = `${BOT_SLUG}/`;
  const branchName = args.branch.startsWith(prefix)
    ? args.branch
    : `${prefix}${args.branch}`;
  const branchSuffix = branchName.slice(prefix.length);
  const repoPath = `/workspace/repos/${args.repo}`;
  const worktreePath = `/workspace/repos/${args.repo}-wt/${BOT_SLUG}/${branchSuffix}`;

  if (!existsSync(repoPath)) {
    console.error(`❌ Repo not found: ${repoPath}`);
    process.exit(1);
  }
  if (existsSync(worktreePath)) {
    console.error(`❌ Worktree already exists: ${worktreePath}`);
    process.exit(1);
  }

  // Verify main checkout is clean
  const status = run("git status --porcelain", { cwd: repoPath });
  if (status) {
    console.error(`⚠️  Main checkout has uncommitted changes:\n${status}`);
    console.error(`Refusing to proceed — clean up the main checkout first.`);
    process.exit(1);
  }

  // Verify on main branch
  const branch = run("git branch --show-current", { cwd: repoPath });
  if (branch !== "main") {
    console.error(`⚠️  Main checkout is on branch '${branch}', expected 'main'.`);
    process.exit(1);
  }

  // Fetch + fast-forward
  console.log(`→ Fetching origin/main…`);
  run("git fetch origin main", { cwd: repoPath });
  run("git pull --ff-only origin main", { cwd: repoPath });

  // Create worktree from origin/main (NOT local main HEAD)
  console.log(`→ Creating worktree at ${worktreePath}…`);
  run(`git worktree add ${worktreePath} -b ${branchName} origin/main`, {
    cwd: repoPath,
    capture: false,
  });

  // Copy remote URL from main checkout (carries fresh App token)
  const remoteUrl = run("git remote get-url origin", { cwd: repoPath });
  if (remoteUrl) {
    run(`git remote set-url origin ${remoteUrl}`, { cwd: worktreePath });
  }

  // Pin the bot identity per-worktree, even though it should be inherited from
  // the global gitconfig. Belt-and-suspenders: a stale per-repo override would
  // silently re-route commits to the container default otherwise.
  run(`git config user.name "${BOT_GIT_NAME}"`, { cwd: worktreePath });
  run(`git config user.email "${BOT_GIT_EMAIL}"`, { cwd: worktreePath });

  // Symlink node_modules from main checkout (saves a full `bun install`).
  //
  // Discovery is dynamic: walk every `node_modules` directory under the
  // main checkout (capped at depth 3 — most sub-packages sit at repo root
  // or one level deep like `apps/web/`) and mirror it into the worktree.
  // Static candidate lists drifted as new sub-packages appeared (e.g.
  // platform's `wiki/`, `vel/`, `doctor/`, `qa/`, `load-testing/`); the
  // discovery approach picks them up for free.  Nested node_modules
  // inside another node_modules are pruned.
  if (args.symlinkNodeModules) {
    const findCmd =
      `find "${repoPath}" -maxdepth 3 -type d -name node_modules ` +
      `-not -path "*/node_modules/*" 2>/dev/null`;
    const found = run(findCmd).split("\n").filter(Boolean);
    for (const mainNm of found) {
      const rel = mainNm.slice(repoPath.length).replace(/^\/+/, "");
      const wtNm = join(worktreePath, rel);
      const wtSubDir = wtNm.replace(/\/node_modules$/, "");
      if (existsSync(wtSubDir) && !existsSync(wtNm)) {
        run(`ln -sf ${mainNm} ${wtNm}`);
        console.log(`  ↪ symlinked ${rel}`);
      }
    }
  }

  const head = run("git rev-parse --short HEAD", { cwd: worktreePath });
  console.log(`\n✅ Worktree ready`);
  console.log(`   Path:   ${worktreePath}`);
  console.log(`   Branch: ${branchName}`);
  console.log(`   Base:   origin/main @ ${head}`);
  console.log(`\nNext: cd ${worktreePath}`);
}

main();
