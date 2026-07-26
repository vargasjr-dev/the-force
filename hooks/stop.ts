/**
 * stop hook — clears per-turn state for the-force PR-linking.
 *
 * Clears the PR link store so the next run starts fresh. Mirrors the pattern
 * used by the default plugins (empty-response, surface-completion-nudge).
 */

import type { PluginHookFn, StopContext } from "@vellumai/plugin-api";

import { clearPrLink } from "../src/pr-link-store.js";

const stop: PluginHookFn<StopContext> = async (ctx) => {
  clearPrLink(ctx.conversationId);
};

export default stop;
