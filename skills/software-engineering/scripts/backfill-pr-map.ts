#!/usr/bin/env bun
/**
 * One-shot backfill for `pr-conversation-map.json`.
 *
 * For each currently-open PR authored by this assistant, find the conversation that
 * most recently mentioned the PR's specific URL — excluding the conversation
 * that's running this script (so we don't collapse every PR onto the live
 * conversation, which is the very bug we're fixing).
 *
 * Records titles for both the PR and the conversation, same shape as
 * register-pr.ts. Only writes entries for PRs that resolved to a real,
 * non-archived conversation. PRs without a hit are left for register-pr.ts
 * on the next push.
 *
 *   bun run skills/software-engineering/scripts/backfill-pr-map.ts
 *     [--dry-run]    Print proposed entries without writing.
 *     [--include-self]  Don't exclude the current conversation. Useful if
 *                       the script is run from a conversation that legitimately
 *                       owns some PRs.
 */

import { Database } from "bun:sqlite";
import { createSign } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
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
const GITHUB_ORG = installMeta.githubOrg ?? "vellum-ai";

const MAP_PATH = "/workspace/skills/software-engineering/data/pr-conversation-map.json";
const CONVERSATIONS_DIR = "/workspace/conversations";
const ASSISTANT_DB_PATH = join(
  process.env.VELLUM_WORKSPACE_DIR || "/workspace",
  "data",
  "db",
  "assistant.db",
);
const GITHUB_API = "https://api.github.com";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const includeSelf = args.has("--include-self");
const selfConvoId = process.env.__CONVERSATION_ID || "";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getDaemonSecret(name: string): Promise<string> {
  const port = Number(process.env.VELLUM_DAEMON_PORT || 8000);
  const host = process.env.VELLUM_DAEMON_HOST || "127.0.0.1";
  const signingKeyPath = "/workspace/deprecated/actor-token-signing-key";
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
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const installations = (await installRes.json()) as Array<{ id: number; account?: { login?: string } }>;
  const installation = installations.find((i) => i.account?.login === GITHUB_ORG) || installations[0];
  if (!installation) throw new Error("No installations found");
  const tokenRes = await fetch(`${GITHUB_API}/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const tokenData = (await tokenRes.json()) as { token: string };
  return tokenData.token;
}

async function getAppSlug(): Promise<string> {
  const appId = await getDaemonSecret("github:app_id");
  const privateKey = await getDaemonSecret("github:app_private_key");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = base64url(sign.sign(privateKey));
  const jwt = `${header}.${payload}.${signature}`;
  const res = await fetch(`${GITHUB_API}/app`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const data = (await res.json()) as { slug: string };
  return data.slug;
}

type OpenPR = { owner: string; repo: string; number: number; title: string };

async function discoverOpenPRs(token: string, appSlug: string): Promise<OpenPR[]> {
  const query = `is:pr is:open author:app/${appSlug} org:${GITHUB_ORG}`;
  const res = await fetch(
    `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=100&sort=updated&order=desc`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } },
  );
  const body = (await res.json()) as { items?: Array<{ number: number; repository_url: string; title: string }> };
  const items = body.items ?? [];
  return items.map((it) => {
    const parts = it.repository_url.split("/");
    return {
      owner: parts[parts.length - 2]!,
      repo: parts[parts.length - 1]!,
      number: it.number,
      title: it.title,
    };
  });
}

function getConversationTitle(id: string): string | undefined {
  try {
    if (!existsSync(ASSISTANT_DB_PATH)) return undefined;
    const db = new Database(ASSISTANT_DB_PATH, { readonly: true });
    const row = db.query("SELECT title FROM conversations WHERE id = ?").get(id) as
      | { title: string | null }
      | null;
    db.close();
    return row?.title || undefined;
  } catch {
    return undefined;
  }
}

function isConversationArchived(id: string): boolean {
  try {
    if (!existsSync(ASSISTANT_DB_PATH)) return false;
    const db = new Database(ASSISTANT_DB_PATH, { readonly: true });
    const row = db.query("SELECT archived_at FROM conversations WHERE id = ?").get(id) as
      | { archived_at: number | null }
      | null;
    db.close();
    return row?.archived_at != null;
  } catch {
    return false;
  }
}

/**
 * Scan all conversation files (not just the recent 10). For each PR, return
 * the most recently modified conversation that contains the PR's specific
 * URL. Excludes the live conversation unless --include-self.
 */
function buildConvoIndex(): Array<{ id: string; mtime: number; path: string }> {
  if (!existsSync(CONVERSATIONS_DIR)) return [];
  return readdirSync(CONVERSATIONS_DIR)
    .map((name) => {
      const messagesPath = join(CONVERSATIONS_DIR, name, "messages.jsonl");
      try {
        const mtime = statSync(messagesPath).mtimeMs;
        const underscoreIdx = name.indexOf("_");
        if (underscoreIdx === -1) return null;
        const id = name.slice(underscoreIdx + 1);
        return { id, mtime, path: messagesPath };
      } catch {
        return null;
      }
    })
    .filter((d): d is { id: string; mtime: number; path: string } => d !== null)
    .sort((a, b) => b.mtime - a.mtime);
}

function resolveConversationForPR(
  pr: OpenPR,
  convoIndex: Array<{ id: string; mtime: number; path: string }>,
): string | undefined {
  const needles = [
    `/${pr.owner}/${pr.repo}/pull/${pr.number}`,
    `/${pr.owner}/${pr.repo}/pull/${pr.number}/`,
    `/${pr.owner}/${pr.repo}/pull/${pr.number}"`,
  ];

  for (const c of convoIndex) {
    if (!includeSelf && c.id === selfConvoId) continue;
    if (isConversationArchived(c.id)) continue;
    try {
      const content = readFileSync(c.path, "utf8");
      // Use a strict URL match (not bare `#1234`) so PR numbers in unrelated
      // workstream notes don't match the wrong PR.
      if (needles.some((n) => content.includes(n))) return c.id;
    } catch {
      // skip
    }
  }
  return undefined;
}

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
  const ordered: Record<string, Entry> = {};
  for (const k of Object.keys(map).sort()) ordered[k] = map[k]!;
  const tmp = `${MAP_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(ordered, null, 2) + "\n");
  renameSync(tmp, MAP_PATH);
}

(async () => {
  console.log(`📖 Loading installation token...`);
  const token = await getInstallationToken();
  const slug = await getAppSlug();

  console.log(`🔍 Discovering open PRs by ${slug}...`);
  const prs = await discoverOpenPRs(token, slug);
  console.log(`   Found ${prs.length} open PR(s).`);

  console.log(`🗂  Indexing conversation files (excludeSelf=${!includeSelf}, self=${selfConvoId.slice(0, 8) || "n/a"}…)...`);
  const convoIndex = buildConvoIndex();
  console.log(`   Indexed ${convoIndex.length} conversation(s).`);

  const map = loadMap();
  let added = 0;
  let kept = 0;

  for (const pr of prs) {
    const key = `${pr.repo}:${pr.number}`;
    if (map[key]) {
      kept++;
      console.log(`   = ${key} (already mapped)`);
      continue;
    }
    const convoId = resolveConversationForPR(pr, convoIndex);
    if (!convoId) {
      console.log(`   ✗ ${key} — no matching conversation`);
      continue;
    }
    const title = getConversationTitle(convoId);
    const now = Date.now();
    const entry: Entry = {
      prNumber: pr.number,
      repo: pr.repo,
      owner: pr.owner,
      conversationId: convoId,
      ...(title ? { conversationTitle: title } : {}),
      ...(pr.title ? { prTitle: pr.title } : {}),
      registeredAt: now,
      updatedAt: now,
    };
    map[key] = entry;
    added++;
    const titleSnippet = title ? ` (${title})` : "";
    console.log(`   + ${key} → ${convoId}${titleSnippet}`);
  }

  console.log(``);
  console.log(`Summary: +${added} added, ${kept} kept, ${prs.length - added - kept} skipped`);
  if (dryRun) {
    console.log(`(dry-run, not writing)`);
    return;
  }
  if (added > 0) saveMap(map);
})().catch((err) => {
  console.error("✗ backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
