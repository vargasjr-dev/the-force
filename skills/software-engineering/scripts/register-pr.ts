#!/usr/bin/env bun
/**
 * Register the PR ↔ conversation mapping.
 *
 * Run after opening a PR (or any push that changes which conversation is
 * iterating on it). The github-poll cron consults this file when waking
 * conversations on CI / review events. Without an entry, the cron falls back
 * to URL-scanning recent conversations and tends to pin everything to the
 * most recently active conversation.
 *
 * Map file: /workspace/skills/software-engineering/data/pr-conversation-map.json
 *
 * Usage:
 *   bun run skills/software-engineering/scripts/register-pr.ts \
 *     --pr <number> [--repo <name>] [--conversation <id>] [--branch <name>]
 *
 *   --pr            Required. PR number.
 *   --repo          Defaults to the repo of the current working directory
 *                   (recognised under /workspace/repos/<repo>{,-wt}/...).
 *   --conversation  Defaults to $__CONVERSATION_ID.
 *   --branch        Defaults to `git rev-parse --abbrev-ref HEAD`.
 *
 * The script also resolves the PR title via the GitHub App and the
 * conversation title via the assistant SQLite DB so the live mapping app
 * shows human-readable labels.
 */

import { Database } from "bun:sqlite";
import { execSync } from "child_process";
import { createSign } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";

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

const installMeta = loadInstallMeta();

const MAP_PATH = "/workspace/skills/software-engineering/data/pr-conversation-map.json";
const ASSISTANT_DB_PATH = join(
  process.env.VELLUM_WORKSPACE_DIR || "/workspace",
  "data",
  "db",
  "assistant.db",
);
const GITHUB_API = "https://api.github.com";

// ── CLI parsing ──────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a?.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = "true";
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help === "true" || !args.pr) {
  console.log(
    `Usage: register-pr.ts --pr <number> [--repo <name>] [--conversation <id>] [--branch <name>]\n\n` +
      `Writes/updates an entry in ${MAP_PATH}.`,
  );
  process.exit(args.pr ? 0 : 1);
}

const prNumber = Number(args.pr);
if (!Number.isFinite(prNumber) || prNumber <= 0) {
  console.error(`✗ --pr must be a positive integer (got: ${args.pr})`);
  process.exit(1);
}

// ── Repo auto-detection ──────────────────────────────────────

function detectRepo(): string | undefined {
  if (args.repo) return args.repo;
  const cwd = process.cwd();
  // Match /workspace/repos/<repo>(-wt)?/...
  const m = cwd.match(/\/workspace\/repos\/([^/]+?)(?:-wt)?(?:\/|$)/);
  if (m?.[1]) return m[1];
  // Try the git remote: https://...github.com/<owner>/<repo>(.git)
  try {
    const remote = execSync("git config --get remote.origin.url", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const rm = remote.match(/github\.com[:/][^/]+\/([^/.]+)(?:\.git)?$/);
    if (rm?.[1]) return rm[1];
  } catch {
    // not in a git repo, fall through
  }
  return undefined;
}

const repo = detectRepo();
if (!repo) {
  console.error(
    "✗ Could not infer --repo from cwd or git remote. Pass --repo explicitly.",
  );
  process.exit(1);
}

// Owner comes from install-meta.json (githubOrg), falling back to inferring
// from the git remote. All repos for a given assistant live under one org.
const owner =
  installMeta.githubOrg ??
  (() => {
    try {
      const remote = execSync("git config --get remote.origin.url", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const m = remote.match(/github\.com[:/]([^/]+)\//);
      return m?.[1] ?? "vellum-ai";
    } catch {
      return "vellum-ai";
    }
  })();

// ── Conversation auto-detection ──────────────────────────────

const conversationId = args.conversation || process.env.__CONVERSATION_ID;
if (!conversationId) {
  console.error(
    "✗ No conversation id. Pass --conversation <id> or run with __CONVERSATION_ID set.",
  );
  process.exit(1);
}

// ── Branch auto-detection ────────────────────────────────────

function detectBranch(): string | undefined {
  if (args.branch) return args.branch;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

const branch = detectBranch();

// ── Daemon secrets / GitHub App token ────────────────────────
// Mirrors the helper in /workspace/bin/commands/github-poll.ts.

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getDaemonSecret(name: string): Promise<string> {
  const port = Number(process.env.VELLUM_DAEMON_PORT || 8000);
  const host = process.env.VELLUM_DAEMON_HOST || "127.0.0.1";

  const signingKeyPath = "/workspace/deprecated/actor-token-signing-key";
  if (!existsSync(signingKeyPath)) {
    throw new Error(`Daemon signing key not found at ${signingKeyPath}`);
  }
  const signingKey = readFileSync(signingKeyPath, "utf8").trim();
  const crypto = await import("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: "cli", iat: now, exp: now + 300, scope: "delivery" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", signingKey).update(`${header}.${payload}`).digest("base64url");
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch(`http://${host}:${port}/v1/secrets/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ type: "credential", name, reveal: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Daemon secrets API HTTP ${res.status}`);
  const data = (await res.json()) as { found: boolean; value?: string };
  if (!data.found || !data.value) throw new Error(`Secret ${name} not found`);
  return data.value;
}

async function getInstallationToken(): Promise<string> {
  const appId = await getDaemonSecret("github:app_id");
  const privateKey = await getDaemonSecret("github:app_private_key");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = base64url(sign.sign(privateKey));
  const jwt = `${header}.${payload}.${signature}`;

  const installRes = await fetch(`${GITHUB_API}/app/installations`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!installRes.ok) throw new Error(`Failed to list installations: ${installRes.status}`);
  const installations = (await installRes.json()) as Array<{ id: number; account?: { login?: string } }>;
  const installation = installations.find((i) => i.account?.login === owner) || installations[0];
  if (!installation) throw new Error("No installations found");

  const tokenRes = await fetch(`${GITHUB_API}/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!tokenRes.ok) throw new Error(`Failed to create installation token: ${tokenRes.status}`);
  const tokenData = (await tokenRes.json()) as { token: string };
  return tokenData.token;
}

async function fetchPRTitle(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { title?: string };
    return data.title;
  } catch {
    return undefined;
  }
}

// ── Conversation title lookup ────────────────────────────────

function getConversationTitle(id: string): string | undefined {
  try {
    if (!existsSync(ASSISTANT_DB_PATH)) return undefined;
    const db = new Database(ASSISTANT_DB_PATH, { readonly: true });
    const row = db
      .query("SELECT title FROM conversations WHERE id = ?")
      .get(id) as { title: string | null } | null;
    db.close();
    return row?.title || undefined;
  } catch {
    return undefined;
  }
}

// ── Atomic write ─────────────────────────────────────────────

type Entry = {
  prNumber: number;
  repo: string;
  owner: string;
  branch?: string;
  conversationId: string;
  conversationTitle?: string;
  prTitle?: string;
  registeredAt: number;
  updatedAt: number;
};

function loadMap(): Record<string, Entry> {
  if (!existsSync(MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MAP_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, Entry>): void {
  mkdirSync(dirname(MAP_PATH), { recursive: true });
  // Sort keys so the file diffs cleanly.
  const ordered: Record<string, Entry> = {};
  for (const k of Object.keys(map).sort()) ordered[k] = map[k]!;
  const tmp = `${MAP_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(ordered, null, 2) + "\n");
  renameSync(tmp, MAP_PATH);
}

// ── Main ─────────────────────────────────────────────────────

(async () => {
  const key = `${repo}:${prNumber}`;
  const map = loadMap();
  const existing = map[key];

  let token: string | undefined;
  try {
    token = await getInstallationToken();
  } catch (err) {
    console.warn(
      `⚠️  Could not mint GitHub token (${err instanceof Error ? err.message : err}); proceeding without PR title.`,
    );
  }

  const prTitle = token ? await fetchPRTitle(token) : undefined;
  const conversationTitle = getConversationTitle(conversationId);

  const now = Date.now();
  const entry: Entry = {
    prNumber,
    repo,
    owner,
    ...(branch ? { branch } : {}),
    conversationId,
    ...(conversationTitle ? { conversationTitle } : {}),
    ...(prTitle ? { prTitle } : {}),
    registeredAt: existing?.registeredAt ?? now,
    updatedAt: now,
  };

  map[key] = entry;
  saveMap(map);

  const titleSnippet = prTitle ? ` — "${prTitle}"` : "";
  const convoSnippet = conversationTitle
    ? ` (${conversationTitle})`
    : ` (${conversationId.slice(0, 8)}…)`;
  console.log(
    `✓ Registered ${owner}/${repo}#${prNumber}${titleSnippet} → ${conversationId}${convoSnippet}`,
  );
})().catch((err) => {
  console.error("✗ register-pr failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
