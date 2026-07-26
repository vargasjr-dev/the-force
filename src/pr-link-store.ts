import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Per-conversation PR state for the-force PR-linking hooks.
 *
 * Hook modules can be reloaded or run in a fresh daemon process, so this state
 * lives in the plugin's data directory rather than in module-level Maps.
 *
 * Two different lifetimes:
 *   - The PR URL is per-turn: the `stop` hook clears it so the next run starts
 *     fresh and we don't re-inject a stale link.
 *   - The push repo persists for the conversation. A PR is often referenced in
 *     later turns (after the push turn ended), so the repo context must outlive
 *     the turn that pushed. It is NOT cleared by `stop`.
 */

type Store = {
  prLinks: Record<string, string>;
  pushRepos: Record<string, string>;
};

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const STORE_PATH = join(DATA_DIR, "pr-link-state.json");
function readStore(): Store {
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<Store>;
    return {
      prLinks: parsed.prLinks ?? {},
      pushRepos: parsed.pushRepos ?? {},
    };
  } catch {
    return { prLinks: {}, pushRepos: {} };
  }
}

function writeStore(store: Store): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/** Get the PR URL for a conversation, if one was discovered this run. */
export function getPrLink(conversationId: string): string | undefined {
  return readStore().prLinks[conversationId];
}

/** Store the PR URL for a conversation. */
export function setPrLink(conversationId: string, url: string): void {
  const store = readStore();
  store.prLinks[conversationId] = url;
  writeStore(store);
}

/** Clear the PR URL for a conversation. Called by the stop hook. */
export function clearPrLink(conversationId: string): void {
  const store = readStore();
  delete store.prLinks[conversationId];
  writeStore(store);
}

/**
 * Get the origin repo slug (`owner/repo`) of the most recent push in a
 * conversation, if any push has been observed.
 */
export function getPushRepo(conversationId: string): string | undefined {
  return readStore().pushRepos[conversationId];
}

/** Record the origin repo slug (`owner/repo`) of the most recent push. */
export function setPushRepo(conversationId: string, repo: string): void {
  const store = readStore();
  store.pushRepos[conversationId] = repo;
  writeStore(store);
}
